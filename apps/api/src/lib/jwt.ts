import jwt from "jsonwebtoken";
import type { JwtPayload } from "@doc-to-audio/types";
import { config } from "../config.js";

/** Sign a JWT for an authenticated user. */
export function signToken(payload: Pick<JwtPayload, "sub" | "email">): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

/** Verify a JWT and return its decoded payload, or throw if invalid/expired. */
export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (typeof decoded === "string" || !decoded.sub) {
    throw new Error("Invalid token payload");
  }
  return decoded as JwtPayload;
}
