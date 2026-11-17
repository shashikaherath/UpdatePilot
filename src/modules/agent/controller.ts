import { Request, Response, NextFunction } from 'express';
import { agentService } from './service.js';
import { existsSync, createReadStream } from 'fs';
import { join } from 'path';

export class AgentController {
  async downloadScript(_req: Request, res: Response, next: NextFunction) {
    try {
      const scriptPath = join(process.cwd(), 'agent', 'UpdatePilotAgent.ps1');
      if (!existsSync(scriptPath)) {
        res.status(404).json({ error: { message: 'Agent script not found on server.' } });
        return;
      }
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="UpdatePilotAgent.ps1"');
      createReadStream(scriptPath).pipe(res);
    } catch (error) {
      next(error);
    }
  }

  async pair(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await agentService.pairDevice(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async heartbeat(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await agentService.heartbeat(req.device!.id, req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async claimJob(req: Request, res: Response, next: NextFunction) {
    try {
      const job = await agentService.claimJob(req.device!.id);
      if (!job) {
        res.status(204).send();
        return;
      }
      console.log(`[AGENT_JOB_CLAIMED] deviceId=${req.device!.id} jobId=${job.jobId} kind=${job.kind}`);
      res.status(200).json(job);
    } catch (error) {
      next(error);
    }
  }

  async submitScanResults(req: Request, res: Response, next: NextFunction) {
    try {
      const appCount = req.body.applications?.length ?? 0;
      console.log(`[AGENT_SCAN_RESULTS_SUBMITTED] deviceId=${req.device!.id} jobId=${req.params.id} applicationsCount=${appCount}`);
      const result = await agentService.submitScanResults(
        req.device!.id,
        req.params.id,
        req.body
      );
      console.log(`[AGENT_SCAN_RESULTS_PERSISTED] deviceId=${req.device!.id} jobId=${req.params.id} status=${result.status}`);
      res.status(200).json(result);
    } catch (error) {
      console.error(`[AGENT_SCAN_PERSISTENCE_FAILED] deviceId=${req.device!.id} jobId=${req.params.id}`, error);
      next(error);
    }
  }

  async submitJobResult(req: Request, res: Response, next: NextFunction) {
    try {
      console.log(`[AGENT_JOB_RESULT_SUBMITTED] deviceId=${req.device!.id} jobId=${req.params.id} status=${req.body.status}`);
      const result = await agentService.submitJobResult(
        req.device!.id,
        req.params.id,
        req.body
      );
      res.status(200).json(result);
    } catch (error) {
      console.error(`[AGENT_JOB_RESULT_FAILED] deviceId=${req.device!.id} jobId=${req.params.id}`, error);
      next(error);
    }
  }

  async renewJobLease(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await agentService.renewJobLease(req.device!.id, req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async reportJobProgress(req: Request, res: Response, next: NextFunction) {
    try {
      const { downloadedMB, totalMB } = req.body as { downloadedMB: number; totalMB: number };
      const result = await agentService.reportJobProgress(
        req.device!.id,
        req.params.id,
        downloadedMB,
        totalMB
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const agentController = new AgentController();
