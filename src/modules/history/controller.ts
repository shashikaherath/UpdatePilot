import { Request, Response, NextFunction } from 'express';
import { historyService } from './service.js';
import { ListHistoryQuery } from './schemas.js';

export class HistoryController {
  async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await historyService.getHistory(
        req.user!.id,
        req.query as unknown as ListHistoryQuery
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async exportCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await historyService.exportCsv(
        req.user!.id,
        req.query as unknown as ListHistoryQuery
      );
      const filename = `updatepilot-history-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }
}

export const historyController = new HistoryController();
