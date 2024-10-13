import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AgentService } from './agent.service';
import { AgentDto } from './dtos/agent.dto';
import { IssueCourseCredentialDto } from './dtos/IssueCourseCredential.dto';
import { VerifyCourseCredentialDto } from './dtos/VerifyCourseCredential.dto';

@ApiTags('Agent')
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('spinup')
  @ApiOperation({ summary: 'Spin up a new agent with given seed and network' })
  @ApiResponse({ status: 201, description: 'Agent successfully initialized' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async agentInitialize(@Body() agentDto: AgentDto) {
    return await this.agentService.agentInitialize(agentDto);
  }

  @Post('create-invitation')
  async createInvitation() {
    return await this.agentService.createInvitation();
  }

  @Get('connection-state/id/:id')
  async getConnectionState(@Param('id') id: string) {
    return await this.agentService.getConnectionState(id);
  }

  @Post('issue-phc/name/:name')
  @ApiOperation({ summary: 'Issue Personhood Credential' })
  @ApiResponse({ status: 201, description: 'Credential offer created successfully (OOB)' })
  async issuePHC(@Param('name') name: string) {
    return await this.agentService.issuePHC(name);
  }  

  @Post('issue-student-access-card/name/:name')
  @ApiOperation({ summary: 'Issue Student Access Card' })
  @ApiResponse({ status: 201, description: 'Credential offer created successfully (OOB)' })
  async issueStudentAccessCard(@Param('name') name: string) {
    return await this.agentService.issueStudentAccessCard(name);
  }  
  
  @Post('verify-student-access-card/connectionId/:connectionId')
  @ApiOperation({ summary: 'Verify Student Access Card' })
  @ApiResponse({ status: 201, description: 'Proof request initiated successfully (OOB)' })
  async verifyStudentAccessCard(@Param('connectionId') connectionId: string) {
    return await this.agentService.verifyStudentAccessCard(connectionId);
  }

  @Post('verify-phc')
  @ApiOperation({ summary: 'Verify Personhood Credential' })
  @ApiResponse({ status: 201, description: 'Proof request initiated successfully (OOB)' })
  async verifyPHC() {
    return await this.agentService.verifyPHC();
  }

  @Post('issue/:courseTag')
  async issueCourseCredential(
    @Param('courseTag') courseTag: string,
    @Body() issueCourseCredentialDto: IssueCourseCredentialDto,
  ) {
    const { name, marks, connectionId } = issueCourseCredentialDto;
    return await this.agentService.issueCourseCredential(name, marks, courseTag, connectionId);
  }

  @Post('verify/:courseTag')
  async verifyCourseCredential(
    @Param('courseTag') courseTag: string,
    @Body() verifyCourseCredentialDto: VerifyCourseCredentialDto,
  ) {
    const { connectionId } = verifyCourseCredentialDto;
    return await this.agentService.verifyCourseCredential(connectionId, courseTag);
  }

  @Post('check-performance/connectionId/:connectionId')
  async checkPerformance(@Param('connectionId') connectionId: string) {
    return await this.agentService.checkPerformance(connectionId);
  }

  @Get('requested-data/id/:id')
  async getRequestedData(@Param('id') id: string) {
    return await this.agentService.getRequestedData(id);
  }

  @Get('verification-state/id/:id')
  @ApiOperation({ summary: 'Get verification state' })
  @ApiResponse({ status: 200, description: 'Verification state fetched successfully' })
  async getVerificationState(@Param('id') id: string) {
    return await this.agentService.getVerificationState(id);
  }  
  
  @Get('credential-state/id/:id')
  @ApiOperation({ summary: 'Get credential state' })
  @ApiResponse({ status: 200, description: 'Credential state fetched successfully' })
  async getCredentialState(@Param('id') id: string) {
    return await this.agentService.getCredentialState(id);
  }

  @Get('credential-definitions')
  @ApiOperation({ summary: 'Retrieve all credential definitions' })
  @ApiResponse({ status: 200, description: 'List of credential definitions returned successfully' })
  async getAllCredentialDefinitions() {
    return await this.agentService.getAllCredentialDefinitions();
  }
  
  @Get('credential-definitions/tag/:tag')
  @ApiOperation({ summary: 'Retrieve credential definition by tag' })
  @ApiResponse({ status: 200, description: 'Credential definition returned successfully' })
  @ApiResponse({ status: 404, description: 'Credential definition not found' })
  async getCredentialDefinitionByTag(@Param('tag') tag: string) {
    return await this.agentService.getCredentialDefinitionByTag(tag);
  }
}
