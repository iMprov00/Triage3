import { useEffect, useState } from "react";
import { apiJson } from "../api";

type StatsResponse = {
  stub: boolean;
  message: string;
  generated_at?: string;
};

export default function StatisticsStubPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiJson<StatsResponse>("/api/v1/stage2/statistics");
        setData(r);
      } catch {
        setErr("Не удалось загрузить статистику");
      }
    })();
  }, []);

  return (
    <div className="container-fluid triag-page-wide">
      <h1 className="h4 mb-3">Статистика · Этап 2</h1>
      {err && <div className="alert alert-warning">{err}</div>}
      {data && (
        <div className="card shadow-sm">
          <div className="card-body text-center py-5">
            <i className="bi bi-bar-chart text-muted display-4" aria-hidden />
            <p className="mt-3 mb-1">{data.message}</p>
            {data.generated_at && <p className="small text-muted mb-0">Обновлено: {new Date(data.generated_at).toLocaleString("ru-RU")}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
