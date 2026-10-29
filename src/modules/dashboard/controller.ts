import { Request, Response, NextFunction } from 'express';
import { dashboardService } from './service.js';

export class DashboardController {
  async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await dashboardService.getOverview(req.user!.id);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
}

export const dashboardController = new DashboardController();
