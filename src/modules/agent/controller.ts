import { Request, Response, NextFunction } from 'express';
import { agentService } from './service.js';

export class AgentController {
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
      res.status(200).json(job);
    } catch (error) {
      next(error);
    }
  }

  async submitScanResults(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await agentService.submitScanResults(
        req.device!.id,
        req.params.id,
        req.body
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async submitJobResult(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await agentService.submitJobResult(
        req.device!.id,
        req.params.id,
        req.body
      );
      res.status(200).json(result);
    } catch (error) {
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
}

export const agentController = new AgentController();
