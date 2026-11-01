import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist/browser");
http
  .createServer(async (req, res) => {
    try {
      const file = path.resolve(
        root,
        "." + (req.url === "/" ? "/index.html" : req.url.split("?")[0]),
      );
      if (!file.startsWith(root + path.sep)) throw Error();
      res.setHeader(
        "Content-Type",
        file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".png")
            ? "image/png"
            : file.endsWith(".wav")
              ? "audio/wav"
              : "text/html; charset=utf-8",
      );
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.PORT || 4173), "127.0.0.1", () =>
    console.log(
      "Browser development preview: http://127.0.0.1:4173 (not a WeChat validation)",
    ),
  );
