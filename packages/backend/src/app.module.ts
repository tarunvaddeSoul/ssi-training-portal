import { Logger, Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ConfigModule } from '@nestjs/config';
import { IssuanceController } from './issuance/issuance.controller';
import { VerificationController } from './verification/verification.controller';
import { IssuanceService } from './issuance/issuance.service';
import { VerificationService } from './verification/verification.service';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [AgentController, IssuanceController, VerificationController],
  providers: [AgentService, Logger, IssuanceService, VerificationService],
})
export class AppModule {}
