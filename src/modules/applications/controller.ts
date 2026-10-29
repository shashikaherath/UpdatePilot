import { Request, Response, NextFunction } from 'express';
import { applicationService } from './service.js';
import { ListApplicationsQuery } from './schemas.js';

export class ApplicationController {
  async listApplications(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await applicationService.listApplications(
        req.user!.id,
        req.query as unknown as ListApplicationsQuery
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getApplicationById(req: Request, res: Response, next: NextFunction) {
    try {
      const app = await applicationService.getApplicationById(req.user!.id, req.params.id);
      res.status(200).json(app);
    } catch (error) {
      next(error);
    }
  }
}

export const applicationController = new ApplicationController();
