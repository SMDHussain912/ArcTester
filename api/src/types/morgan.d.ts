declare module "morgan" {
  import type { Request, Response, RequestHandler } from "express";

  interface Morgan {
    (format: string, options?: {
      skip?: (req: Request, res: Response) => boolean;
    }): RequestHandler;
    token(
      name: string,
      callback: (req: Request, res: Response) => string | undefined
    ): void;
  }

  const morgan: Morgan;
  export default morgan;
}
