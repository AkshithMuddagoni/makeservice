import { createConnection } from "node:net";

export type MalwareScanResult = { clean: true } | { clean: false; signature: string };

export function parseClamAvStreamResponse(response: string): MalwareScanResult {
  const normalized = response.replace(/\0/g, "").trim();
  if (/^stream:\s*OK$/i.test(normalized)) return { clean: true };
  const found = normalized.match(/^stream:\s*(.+?)\s+FOUND$/i);
  if (found) return { clean: false, signature: found[1].slice(0, 160) };
  throw new Error("The malware scanner returned an incomplete or invalid response.");
}

/**
 * Stream document bytes to clamd using the INSTREAM protocol. The scanner
 * remains a separate private service; an unreachable scanner fails closed.
 */
export async function scanProviderDocument(bytes: Uint8Array): Promise<MalwareScanResult> {
  const host = process.env.CLAMAV_HOST?.trim();
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Provider document uploads are disabled until the private malware scanner is configured.");
  }
  if (bytes.length < 1 || bytes.length > 10 * 1024 * 1024) {
    throw new Error("Document size is outside the accepted range.");
  }

  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let response = "";
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(30_000);
    socket.on("timeout", () => fail(new Error("The malware scanner timed out. No document was accepted.")));
    socket.on("error", () => fail(new Error("The malware scanner is unavailable. No document was accepted.")));
    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("utf8");
      if (response.length > 2048) {
        fail(new Error("The malware scanner returned an invalid response."));
      }
    });
    socket.on("end", () => {
      if (settled) return;
      try {
        const result = parseClamAvStreamResponse(response);
        settled = true;
        if (!result.clean) {
          reject(new Error("The uploaded file was rejected by the malware scanner."));
        } else {
          resolve(result);
        }
      } catch (error) {
        settled = true;
        reject(error instanceof Error ? error : new Error("The malware scan failed."));
      }
    });
    socket.on("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0", "utf8"));
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
        const header = Buffer.allocUnsafe(4);
        header.writeUInt32BE(chunk.length, 0);
        socket.write(header);
        socket.write(Buffer.from(chunk));
      }
      socket.write(Buffer.alloc(4));
      socket.end();
    });
  });
}
