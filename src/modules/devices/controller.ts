import { Request, Response, NextFunction } from 'express';
import { deviceService } from './service.js';

export class DeviceController {
  async listDevices(req: Request, res: Response, next: NextFunction) {
    try {
      const devices = await deviceService.getDevicesForUser(req.user!.id);
      res.status(200).json({ data: devices });
    } catch (error) {
      next(error);
    }
  }

  async createPairingCode(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await deviceService.createPairingCode(req.user!.id, req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async revokeDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await deviceService.revokeDevice(req.user!.id, req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const deviceController = new DeviceController();
