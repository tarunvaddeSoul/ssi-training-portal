import {
  RestRootAgent,
  RestRootAgentWithTenants,
} from '@credo-ts/rest/build/utils/agent';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AgentService } from '../agent.service';
import {
  Agent,
  AutoAcceptProof,
  CreateOutOfBandInvitationConfig,
  OutOfBandRecord,
} from '@credo-ts/core';
import {
  parseIndyCredentialDefinitionId,
  getUnqualifiedCredentialDefinitionId,
} from '@credo-ts/anoncreds';
import { IssuanceService } from '../issuance/issuance.service';
import * as turl from 'turl';

@Injectable()
export class VerificationService {
  constructor(
    private readonly agentService: AgentService,
    private logger: Logger,
    private readonly issuanceService: IssuanceService,
  ) {}

  public async getAgent(): Promise<RestRootAgent | RestRootAgentWithTenants> {
    return await this.agentService.getAgent();
  }

  async verifyCourseCredential(connectionId: string, courseTag: string) {
    try {
      const agent = (await this.getAgent()) as Agent;

      const credentialDefinition =
        await this.issuanceService.getCredentialDefinitionByTag(courseTag);
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

      const verifyCourseResponse = await agent.proofs.requestProof({
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
      const agent = (await this.getAgent()) as Agent;

      const credentialDefinition =
        await this.issuanceService.getCredentialDefinitionByTag(
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
      const verifyPHCResponse = await agent.proofs.requestProof({
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

  async verifyPHC() {
    try {
      const agent = (await this.getAgent()) as Agent;

      const credentialDefinition =
        await this.issuanceService.getCredentialDefinitionByTag(
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
      const verifyPHCResponse = await agent.proofs.createRequest({
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
        (await agent.oob.createInvitation(
          createInvitationPayload,
        )) as OutOfBandRecord;
      const invitationUrl = outOfBandRecord.outOfBandInvitation.toUrl({
        domain: agent.config.endpoints[0] as string,
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
      const agent = (await this.getAgent()) as Agent;

      const verificationRecord = await agent.proofs.getById(id);
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

  async getRequestedData(id: string) {
    try {
      const agent = (await this.getAgent()) as Agent;

      const data = (await agent?.proofs.getFormatData(id)) as any;
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
      const agent = (await this.getAgent()) as Agent;

      const proofResponse = await agent?.proofs.requestProof({
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
}
