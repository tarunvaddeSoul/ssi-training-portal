import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { AgentDto } from './dtos/agent.dto';
import { NYM_URL, ledgerOptions } from './agentUtils/ledgerConfig';
import { NetworkOptions } from './enums';
import { setupApp, CredoRestAgentConfig } from '@credo-ts/rest';
import {
  Agent,
  AutoAcceptCredential,
  AutoAcceptProof,
  CreateOutOfBandInvitationConfig,
  KeyType,
  LogLevel,
  OutOfBandRecord,
  TypedArrayEncoder,
} from '@credo-ts/core';
import express from 'express';
import {
  RestRootAgent,
  RestRootAgentWithTenants,
} from '@credo-ts/rest/build/utils/agent';
import { createRestAgent } from './agentUtils/restAgent';
import { connect } from 'ngrok';
import { IndyVdrPoolConfig } from './interface/agent.interface';
import {
  AnonCredsCredentialDefinitionRecord,
  getUnqualifiedCredentialDefinitionId,
  parseIndyCredentialDefinitionId,
} from '@credo-ts/anoncreds';
import * as turl from 'turl';

export class AgentWrapper {
  public agent: Agent | RestRootAgent | null = null;

  constructor(
    public readonly id: string,
    public readonly adminPort: number,
    public readonly inboundPort: number,
    private config: CredoRestAgentConfig,
  ) {}

  async initialize(): Promise<void> {
    this.agent = await createRestAgent(this.config);
    await this.setupExpressApp();
  }

  getAgent(): RestRootAgent | RestRootAgentWithTenants {
    if (!this.agent) {
      throw new Error('Agent not initialized');
    }
    return this.agent;
  }

  getEndpoints(): string[] {
    return this.getAgent().config.endpoints;
  }

  private async setupExpressApp(): Promise<void> {
    const app = express();
    try {
      const { start } = await setupApp({
        baseApp: app,
        adminPort: this.adminPort,
        enableCors: true,
        agent: this.getAgent(),
        // webhookUrl: "http://localhost:5000/agent-events",
      });
      start();
    } catch (error: any) {
      if (error.code === 'EADDRINUSE') {
        throw new HttpException(
          `Admin port ${this.adminPort} is already in use. Please try again with a different port.`,
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }
  }
}

@Injectable()
export class AgentService {
  private agentWrapper: AgentWrapper | null = null;
  public agent: Agent | RestRootAgent | null = null;

  private readonly agentHost: string;
  private readonly adminPort: number;
  private readonly inboundPort: number;
  // private readonly dbHost: string;
  // private readonly dbUser: string;
  // private readonly dbPassword: string;

  constructor(private readonly logger: Logger) {
    const { AGENT_HOST, ADMIN_PORT, INBOUND_PORT } = process.env;

    if (!AGENT_HOST || !ADMIN_PORT || !INBOUND_PORT) {
      throw new Error(
        'Missing required environment variables to initialize the agent',
      );
    }

    this.agentHost = AGENT_HOST;
    this.adminPort = parseInt(ADMIN_PORT);
    this.inboundPort = parseInt(INBOUND_PORT);
  }

  async agentInitialize(agentDto: AgentDto) {
    const { seed, network } = agentDto;

    try {
      const inboundPort = this.inboundPort;
      const adminPort = this.adminPort;
      // const agentId = uuidv4();
      const agentId = '401';
      const agentLabel = `agent-${agentId}`;
      const walletId = `wallet-${agentId}`;

      // const endpoint = await connect(inboundPort);
      const endpoint = `https://aec3-2401-4900-30d9-6050-ccc5-3591-13b6-1de2.ngrok-free.app`;
      // const endpoint = `${this.agentHost}${inboundPort}`;

      const agentConfig = this.createAgentConfig(
        agentLabel,
        walletId,
        inboundPort,
        network,
        endpoint,
      );
      const agentWrapper = new AgentWrapper(
        agentId,
        adminPort,
        inboundPort,
        await agentConfig,
      );

      if (this.agent) {
        throw new HttpException(
          `An agent already initialized at port ${adminPort}. Agent endpoint: ${this.agent.config.endpoints}.`,
          HttpStatus.CONFLICT,
        );
      }
      await agentWrapper.initialize();
      const agent = agentWrapper.getAgent();

      this.setAgent(agent);

      const did = await this.didRegistration(agent, network, seed);

      this.logger.debug(
        `Agent initialized - ID: ${agentId}, Admin Port: ${adminPort}, Inbound Port: ${inboundPort}`,
      );
      this.logger.debug(
        `Agent endpoints: ${JSON.stringify(agent.config.endpoints)}`,
      );

      const agentDetails = { agentId, adminPort, inboundPort, did, endpoint };
      return {
        statusCode: HttpStatus.CREATED,
        message: 'Agent initialized successfully',
        data: agentDetails,
      };
    } catch (error: any) {
      this.logger.error(`Failed to initialize agent: ${error.message}`);
      throw new HttpException(
        `Agent initialization failed: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getAllCredentialDefinitions() {
    try {
      const agent = (await this.getAgent()) as Agent;

      if (!agent.modules || !agent.modules.anoncreds) {
        throw new Error('Agent modules or anoncreds module not available.');
      }

      const credentialDefinitions =
        await this.agent?.modules.anoncreds.getCreatedCredentialDefinitions({});
      if (credentialDefinitions.length == 0) {
        throw new NotFoundException(`Credential definitions not found.`);
      }
      return credentialDefinitions;
    } catch (error) {
      throw error;
    }
  }

  async getCredentialDefinitionByTag(tag: string) {
    try {
      const credentialDefinitions: AnonCredsCredentialDefinitionRecord[] =
        await this.agent?.modules.anoncreds.getCreatedCredentialDefinitions({});
      if (credentialDefinitions.length == 0) {
        throw new NotFoundException(`Credential definitions not found.`);
      }
      const credentialDefinition = credentialDefinitions.find(
        (x) => x.credentialDefinition.tag === tag,
      );
      if (!credentialDefinition) {
        throw new NotFoundException(`Credential definition not found.`);
      }
      return credentialDefinition;
    } catch (error) {
      throw error;
    }
  }

  async issuePHC(name: string) {
    try {
      const credentialDefinition = await this.getCredentialDefinitionByTag(
        'PHC Credential',
      );
      const indyCredDefId = parseIndyCredentialDefinitionId(
        credentialDefinition.credentialDefinitionId,
      );
      const getCredentialDefinitionId =
        await getUnqualifiedCredentialDefinitionId(
          indyCredDefId.namespaceIdentifier,
          indyCredDefId.schemaSeqNo,
          indyCredDefId.tag,
        );
      const currentTimeInSeconds = Math.floor(Date.now() / 1000); // Current time in seconds
      const expiryTimeInSeconds = currentTimeInSeconds + 60 * 60 * 60; // Adding 60 minutes (3600 seconds)

      const issuePHCResponse = await this.agent?.credentials.createOffer({
        protocolVersion: 'v2' as never,
        autoAcceptCredential: AutoAcceptCredential.Always,
        credentialFormats: {
          anoncreds: {
            credentialDefinitionId: `${getCredentialDefinitionId}`,
            attributes: [
              {
                name: 'Name',
                mimeType: 'text/plain',
                value: name,
              },
              {
                name: 'Issued By',
                mimeType: 'text/plain',
                value: 'SSI Portal',
              },
              {
                name: 'Expiry',
                mimeType: 'text/plain',
                value: expiryTimeInSeconds.toString(), // Setting expiry to current time + 60 minutes
              },
            ],
          },
        },
      });

      const message = issuePHCResponse?.message;

      const createInvitationPayload = {
        autoAcceptConnection: true,
        messages: [message],
      } as CreateOutOfBandInvitationConfig;

      const outOfBandRecord: OutOfBandRecord =
        (await this.agent?.oob.createInvitation(
          createInvitationPayload,
        )) as OutOfBandRecord;
      const invitationUrl = outOfBandRecord.outOfBandInvitation.toUrl({
        domain: this.agent?.config.endpoints[0] as string,
      });

      const shortUrl = turl
        .shorten(invitationUrl)
        .then((res) => res)
        .catch((err) => {
          this.logger.error(err);
        });

      return {
        statusCode: HttpStatus.CREATED,
        message: 'Credential offer created successfully (OOB)',
        data: {
          credentialUrl: await shortUrl,
          credentialRecord: issuePHCResponse?.credentialRecord,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async issueStudentAccessCard(name: string) {
    try {
      const credentialDefinition = await this.getCredentialDefinitionByTag(
        'Student Access Card',
      );
      const indyCredDefId = parseIndyCredentialDefinitionId(
        credentialDefinition.credentialDefinitionId,
      );
      const getCredentialDefinitionId =
        await getUnqualifiedCredentialDefinitionId(
          indyCredDefId.namespaceIdentifier,
          indyCredDefId.schemaSeqNo,
          indyCredDefId.tag,
        );
      const currentTimeInSeconds = Math.floor(Date.now() / 1000); // Current time in seconds
      const expiryTimeInSeconds = currentTimeInSeconds + 60 * 60 * 60; // Adding 60 minutes (3600 seconds)
      const ID = Math.floor(1000 + Math.random() * 9000).toString();

      const issueStudentAccessCardResponse =
        await this.agent?.credentials.createOffer({
          protocolVersion: 'v2' as never,
          autoAcceptCredential: AutoAcceptCredential.Always,
          credentialFormats: {
            anoncreds: {
              credentialDefinitionId: `${getCredentialDefinitionId}`,
              attributes: [
                {
                  name: 'Name',
                  mimeType: 'text/plain',
                  value: name,
                },
                {
                  name: 'ID',
                  mimeType: 'text/plain',
                  value: ID,
                },
                {
                  name: 'Expiry',
                  mimeType: 'text/plain',
                  value: expiryTimeInSeconds.toString(),
                },
              ],
            },
          },
          comment: 'string',
        });
      const message = issueStudentAccessCardResponse?.message;

      const createInvitationPayload = {
        autoAcceptConnection: true,
        messages: [message],
      } as CreateOutOfBandInvitationConfig;

      const outOfBandRecord: OutOfBandRecord =
        (await this.agent?.oob.createInvitation(
          createInvitationPayload,
        )) as OutOfBandRecord;
      const invitationUrl = outOfBandRecord.outOfBandInvitation.toUrl({
        domain: this.agent?.config.endpoints[0] as string,
      });

      const shortUrl = turl
        .shorten(invitationUrl)
        .then((res) => res)
        .catch((err) => {
          this.logger.error(err);
        });

      return {
        statusCode: HttpStatus.CREATED,
        message: 'Credential offer created successfully (OOB)',
        data: {
          credentialUrl: await shortUrl,
          credentialRecord: issueStudentAccessCardResponse?.credentialRecord,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async issueCourseCredential(
    name: string,
    marks: string,
    courseTag: string,
    connectionId: string,
  ) {
    try {
      const credentialDefinition = await this.getCredentialDefinitionByTag(
        courseTag,
      );
      const indyCredDefId = parseIndyCredentialDefinitionId(
        credentialDefinition.credentialDefinitionId,
      );
      const getCredentialDefinitionId =
        await getUnqualifiedCredentialDefinitionId(
          indyCredDefId.namespaceIdentifier,
          indyCredDefId.schemaSeqNo,
          indyCredDefId.tag,
        );
      const timestamp = Math.floor(Date.now() / 1000); // Current time in epoch

      const courseCredentialResponse =
        await this.agent?.credentials.offerCredential({
          protocolVersion: 'v2' as never,
          autoAcceptCredential: AutoAcceptCredential.Always,
          connectionId,
          credentialFormats: {
            anoncreds: {
              credentialDefinitionId: `${getCredentialDefinitionId}`,
              attributes: [
                {
                  name: 'Name',
                  mimeType: 'text/plain',
                  value: name,
                },
                {
                  name: 'Marks Scored',
                  mimeType: 'text/plain',
                  value: marks,
                },
                {
                  name: 'Timestamp',
                  mimeType: 'text/plain',
                  value: timestamp.toString(),
                },
              ],
            },
          },
          comment: 'Issuing Course Credential',
        });

      return {
        statusCode: HttpStatus.CREATED,
        message: `Credential for ${courseTag} issued successfully`,
        data: {
          credentialRecord: courseCredentialResponse,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async verifyCourseCredential(connectionId: string, courseTag: string) {
    try {
      const credentialDefinition = await this.getCredentialDefinitionByTag(
        courseTag,
      );
      const indyCredDefId = parseIndyCredentialDefinitionId(
        credentialDefinition.credentialDefinitionId,
      );
      const getCredentialDefinitionId =
        await getUnqualifiedCredentialDefinitionId(
          indyCredDefId.namespaceIdentifier,
          indyCredDefId.schemaSeqNo,
          indyCredDefId.tag,
        );
      const currentTimeInSeconds = Math.floor(Date.now() / 1000); // Current time in seconds

      const verifyCourseResponse = await this.agent?.proofs.requestProof({
        autoAcceptProof: AutoAcceptProof.Always,
        comment: `Verifying ${courseTag} Credential`,
        willConfirm: true,
        protocolVersion: 'v2',
        connectionId: connectionId,
        proofFormats: {
          anoncreds: {
            name: `Validating ${courseTag} Credential`,
            version: '1.0',
            requested_predicates: {
              'Validating timestamp': {
                name: 'Timestamp',
                p_type: '<=',
                p_value: currentTimeInSeconds,
                restrictions: [
                  {
                    cred_def_id: `${getCredentialDefinitionId}`,
                  },
                ],
              },
            },
          },
        },
      });

      return {
        statusCode: HttpStatus.CREATED,
        message: `Proof request for ${courseTag} initiated successfully`,
        data: {
          proofRecord: verifyCourseResponse,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async verifyStudentAccessCard(connectionId: string) {
    try {
      const credentialDefinition = await this.getCredentialDefinitionByTag(
        'Student Access Card',
      );
      const indyCredDefId = parseIndyCredentialDefinitionId(
        credentialDefinition.credentialDefinitionId,
      );
      const getCredentialDefinitionId =
        await getUnqualifiedCredentialDefinitionId(
          indyCredDefId.namespaceIdentifier,
          indyCredDefId.schemaSeqNo,
          indyCredDefId.tag,
        );
      const currentTimeInSeconds = Math.floor(Date.now() / 1000); // Current time in seconds
      const verifyPHCResponse = await this.agent?.proofs.requestProof({
        autoAcceptProof: AutoAcceptProof.Always,
        comment: 'string',
        willConfirm: true,
        protocolVersion: 'v2',
        connectionId: connectionId,
        proofFormats: {
          anoncreds: {
            name: 'Validating Student Access Card',
            version: '1.0',
            requested_predicates: {
              'Validating expiration': {
                name: 'Expiry',
                p_type: '>',
                p_value: currentTimeInSeconds,
                restrictions: [
                  {
                    cred_def_id: `${getCredentialDefinitionId}`,
                  },
                ],
              },
            },
          },
        },
      });

      return {
        statusCode: HttpStatus.CREATED,
        message: 'Proof request initiated successfully (OOB)',
        data: {
          proofRecord: verifyPHCResponse,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async getCredentialState(id: string) {
    try {
      const credentialRecord = await this.agent?.credentials.getById(id);
      const state = credentialRecord?.state;
      return {
        statusCode: HttpStatus.OK,
        message: 'Credential state fetched successfully',
        data: {
          state,
          errorMessage: credentialRecord?.errorMessage,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async verifyPHC() {
    try {
      const credentialDefinition = await this.getCredentialDefinitionByTag(
        'PHC Credential',
      );
      const indyCredDefId = parseIndyCredentialDefinitionId(
        credentialDefinition.credentialDefinitionId,
      );
      const getCredentialDefinitionId =
        await getUnqualifiedCredentialDefinitionId(
          indyCredDefId.namespaceIdentifier,
          indyCredDefId.schemaSeqNo,
          indyCredDefId.tag,
        );
      const currentTimeInSeconds = Math.floor(Date.now() / 1000); // Current time in seconds
      const verifyPHCResponse = await this.agent?.proofs.createRequest({
        autoAcceptProof: AutoAcceptProof.Always,
        comment: 'string',
        willConfirm: true,
        protocolVersion: 'v2',
        proofFormats: {
          anoncreds: {
            name: 'Validating PHC',
            version: '1.0',
            requested_predicates: {
              'Validating expiration': {
                name: 'Expiry',
                p_type: '>',
                p_value: currentTimeInSeconds,
                restrictions: [
                  {
                    cred_def_id: `${getCredentialDefinitionId}`,
                  },
                ],
              },
            },
          },
        },
      });

      const message = verifyPHCResponse?.message;

      const createInvitationPayload = {
        autoAcceptConnection: true,
        messages: [message],
      } as CreateOutOfBandInvitationConfig;

      const outOfBandRecord: OutOfBandRecord =
        (await this.agent?.oob.createInvitation(
          createInvitationPayload,
        )) as OutOfBandRecord;
      const invitationUrl = outOfBandRecord.outOfBandInvitation.toUrl({
        domain: this.agent?.config.endpoints[0] as string,
      });

      const shortUrl = turl
        .shorten(invitationUrl)
        .then((res) => res)
        .catch((err) => {
          this.logger.error(err);
        });
      return {
        statusCode: HttpStatus.CREATED,
        message: 'Proof request initiated successfully (OOB)',
        data: {
          proofUrl: await shortUrl,
          proofRecord: verifyPHCResponse?.proofRecord,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async getVerificationState(id: string) {
    try {
      const verificationRecord = await this.agent?.proofs.getById(id);
      const state = verificationRecord?.state;
      return {
        statusCode: HttpStatus.OK,
        message: 'Verification state fetched successfully',
        data: {
          state,
          verified: verificationRecord?.isVerified,
          errorMessage: verificationRecord?.errorMessage,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async createInvitation() {
    try {
      const createInvitationPayload = {
        autoAcceptConnection: true,
        multiUseInvitation: true,
      } as CreateOutOfBandInvitationConfig;

      const outOfBandRecord: OutOfBandRecord =
        (await this.agent?.oob.createInvitation(
          createInvitationPayload,
        )) as OutOfBandRecord;
      const invitationUrl = outOfBandRecord.outOfBandInvitation.toUrl({
        domain: this.agent?.config.endpoints[0] as string,
      });
      return {
        statusCode: HttpStatus.CREATED,
        message: 'Connection invitation created successfully!',
        data: { invitationUrl, outOfBandId: outOfBandRecord.id },
      };
    } catch (error) {
      throw error;
    }
  }

  async getConnectionState(id: string) {
    try {
      const connectionRecord = await this.agent?.connections.findAllByQuery({
        outOfBandId: id,
      });
      console.log(JSON.stringify(connectionRecord, null, 2));
      return {
        statusCode: HttpStatus.OK,
        message: 'Connection state fetched successfully!',
        data: {
          state: connectionRecord?.[0]?.state,
          connectionId: connectionRecord?.[0]?.id,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  private async createAgentConfig(
    agentLabel: string,
    walletId: string,
    inboundPort: number,
    network: NetworkOptions,
    endpoint: string,
  ): Promise<CredoRestAgentConfig> {
    return {
      label: agentLabel,
      walletConfig: {
        id: walletId,
        key: `key-${walletId}`,
        // storage: {
        //   type: "postgres",
        //   config: {
        //     host: this.dbHost || "localhost:5432",
        //   },
        //   credentials: {
        //     account: this.dbUser || "postgres",
        //     password: this.dbPassword || "postgres",
        //   },
        // },
      },
      indyLedgers: [ledgerOptions[network] as IndyVdrPoolConfig],
      multiTenant: false,
      endpoints: [endpoint],
      autoAcceptConnections: false,
      autoAcceptCredentials: AutoAcceptCredential.ContentApproved,
      autoUpdateStorageOnStartup: true,
      autoAcceptProofs: AutoAcceptProof.ContentApproved,
      logLevel: LogLevel.debug,
      inboundTransports: [{ transport: 'http', port: inboundPort }],
      outboundTransports: ['http'],
    } satisfies CredoRestAgentConfig;
  }

  private async didRegistration(
    agent: Agent,
    network: NetworkOptions,
    seed: string,
  ): Promise<string> {
    try {
      this.logger.debug(`Registering DID for network: ${network}`);
      let did: string;
      if (network === NetworkOptions.BCOVRIN_TESTNET) {
        did = await this.registerBcovrinDid(agent, seed);
      } else if (network === NetworkOptions.INDICIO_TESTNET) {
        did = await this.registerIndicioDid(agent, seed);
      } else {
        throw new HttpException(
          `Unsupported network: ${network}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      this.logger.debug('DID registration completed successfully');
      return did;
    } catch (error: any) {
      this.logger.error(`DID registration failed: ${error.message}`);
      throw new HttpException(
        `DID registration failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async registerBcovrinDid(
    agent: Agent,
    seed: string,
  ): Promise<string> {
    try {
      const response = await axios.post(NYM_URL.NYM_BCOVRIN_TESTNET, {
        role: 'ENDORSER',
        alias: 'Alias',
        seed: seed,
      });
      if (response.data && response.data.did) {
        const did = await this.importDid(
          agent,
          'bcovrin:testnet',
          response.data.did,
          seed,
        );
        return did;
      } else {
        throw new HttpException(
          'Invalid response from Bcovrin registration',
          HttpStatus.BAD_GATEWAY,
        );
      }
    } catch (error: any) {
      throw new HttpException(
        `Bcovrin DID registration failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getRequestedData(id: string) {
    try {
      const data = (await this.agent?.proofs.getFormatData(id)) as any;
      return {
        statusCode: HttpStatus.OK,
        message: 'Requested data fetched successfully!',
        data: {
          requestedProof:
            data?.presentation?.anoncreds?.requested_proof?.revealed_attrs,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async checkPerformance(connectionId: string) {
    try {
      const proofResponse = await this.agent?.proofs.requestProof({
        autoAcceptProof: AutoAcceptProof.Always,
        comment: 'string',
        willConfirm: true,
        protocolVersion: 'v2',
        proofFormats: {
          anoncreds: {
            name: 'Requesting Marks',
            version: '1.0',
            requested_attributes: {
              'Requesting Marks of Module 1': {
                name: 'Marks Scored',
                restrictions: [
                  {
                    cred_def_id:
                      'JM9L6HL2QCexjbn9WB46h9:3:CL:2264778:Introduction to SSI',
                  },
                ],
              },
              'Requesting Marks of Module 2': {
                name: 'Marks Scored',
                restrictions: [
                  {
                    cred_def_id:
                      'JM9L6HL2QCexjbn9WB46h9:3:CL:2264791:Digital Identity Fundamentals',
                  },
                ],
              },
              'Requesting Marks of Module 3': {
                name: 'Marks Scored',
                restrictions: [
                  {
                    cred_def_id:
                      'JM9L6HL2QCexjbn9WB46h9:3:CL:2264793:Blockchain and SSI',
                  },
                ],
              },
              'Requesting Marks of Module 4': {
                name: 'Marks Scored',
                restrictions: [
                  {
                    cred_def_id:
                      'JM9L6HL2QCexjbn9WB46h9:3:CL:2264795:Privacy and Security in SSI',
                  },
                ],
              },
              'Requesting Marks of Module 5': {
                name: 'Marks Scored',
                restrictions: [
                  {
                    cred_def_id:
                      'JM9L6HL2QCexjbn9WB46h9:3:CL:2264797:Implementing SSI Solutions',
                  },
                ],
              },
            },
          },
        },
        connectionId,
      });

      return {
        statusCode: HttpStatus.OK,
        message: 'Proof requested successfully!',
        data: { proofRecord: proofResponse },
      };
    } catch (error) {
      throw error;
    }
  }

  private async registerIndicioDid(
    agent: Agent,
    seed: string,
  ): Promise<string> {
    try {
      const indicioBody = await this.createIndicioKey(agent, seed);
      const response = await axios.post(
        NYM_URL.NYM_INDICIO_TESTNET,
        indicioBody,
      );
      if (response.data.statusCode === 200) {
        const did = await this.importDid(
          agent,
          'indicio:testnet',
          indicioBody.did,
          seed,
        );
        return did;
      } else {
        throw new HttpException(
          'Indicio DID registration failed',
          HttpStatus.BAD_GATEWAY,
        );
      }
    } catch (error: any) {
      throw new HttpException(
        `Indicio DID registration failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async importDid(
    agent: Agent,
    didMethod: string,
    did: string,
    seed: string,
  ): Promise<string> {
    await agent.dids.import({
      did: `did:indy:${didMethod}:${did}`,
      overwrite: true,
      privateKeys: [
        {
          keyType: KeyType.Ed25519,
          privateKey: TypedArrayEncoder.fromString(seed),
        },
      ],
    });
    return `did:indy:${didMethod}:${did}`;
  }

  private async createIndicioKey(agent: Agent, seed: string) {
    const key = await agent.wallet.createKey({
      privateKey: TypedArrayEncoder.fromString(seed),
      keyType: KeyType.Ed25519,
    });
    const buffer = TypedArrayEncoder.fromBase58(key.publicKeyBase58);
    const did = TypedArrayEncoder.toBase58(buffer.slice(0, 16));
    return {
      network: 'testnet',
      did,
      verkey: TypedArrayEncoder.toBase58(buffer),
    };
  }

  public async getAgent(): Promise<RestRootAgent> {
    if (!this.agent) {
      throw new BadRequestException('Agent is not initialized.');
    }
    return this.agent;
  }

  async setAgent(agent: RestRootAgent | RestRootAgentWithTenants) {
    this.agent = agent;
  }
}
