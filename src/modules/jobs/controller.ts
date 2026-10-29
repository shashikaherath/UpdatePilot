import { Request, Response, NextFunction } from 'express';
import { jobService } from './service.js';

export class JobController {
  async getJobById(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await jobService.getJobById(req.user!.id, req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const jobController = new JobController();
