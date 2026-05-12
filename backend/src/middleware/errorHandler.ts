//
import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  status?: number;
  errors?: string;
}

// error
export function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction) {
	console.info(err);
	console.info(`${err.status || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
    console.info('===>', err.stack || err);
    res.status(err.status || 500).json({ message: err.stack || err, errors: err.errors || '' });
}
