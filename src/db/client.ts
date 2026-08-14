import "./tls-bootstrap.js";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
