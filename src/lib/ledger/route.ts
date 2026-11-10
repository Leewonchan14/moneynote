import { requireAuth } from "@/lib/auth";
import { ledgerErrorResponse, readJsonBody } from "@/lib/ledger/api";

type Body = Record<string, unknown>;

interface CrudHandlers {
  create?: (body: Body) => Promise<unknown>;
  update?: (body: Body) => Promise<unknown>;
  remove?: (body: Body) => Promise<unknown>;
  fallback: string;
  duplicate?: string;
}

const handle =
  (run: (body: Body) => Promise<unknown>, options: CrudHandlers, status: number) =>
  async (req: Request): Promise<Response> => {
    const authError = await requireAuth(req);
    if (authError) return authError;

    const body = await readJsonBody(req);
    if (!body) {
      return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
    }

    try {
      return Response.json({ result: (await run(body)) ?? null }, { status });
    } catch (error) {
      return ledgerErrorResponse(error, {
        fallback: options.fallback,
        duplicate: options.duplicate,
      });
    }
  };

const notAllowed = async () =>
  Response.json({ error: "지원하지 않는 요청이에요." }, { status: 405 });

/** 인증·본문 검사·오류 변환이 같은 POST/PATCH/DELETE 라우트를 만든다. */
export const crudRoutes = (options: CrudHandlers) => ({
  POST: options.create ? handle(options.create, options, 201) : notAllowed,
  PATCH: options.update ? handle(options.update, options, 200) : notAllowed,
  DELETE: options.remove ? handle(options.remove, options, 200) : notAllowed,
});
