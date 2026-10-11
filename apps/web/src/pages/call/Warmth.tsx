import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError, errorMessage } from "@/lib/api";
import { WARMTH_ANCHORS, type WarmthDoc } from "@sc/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

type WarmthView = WarmthDoc & { gap: number | null; discussion_prompt: string | null };

export function Warmth() {
  const { logId } = useParams();
  const [rating, setRating] = useState<WarmthView | null>(null);
  const load = useCallback(async () => {
    if (!logId) return;
    try { setRating((await api<{ warmth: WarmthView }>(`/logs/${logId}/warmth`)).warmth); }
    catch (err) { if (!(err instanceof ApiError && err.status === 404)) toast.error(errorMessage(err)); }
  }, [logId]);
  useEffect(() => void load(), [load]);
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">Call warmth</h1>
    <Card><CardHeader><CardTitle>Caller rating</CardTitle></CardHeader><CardContent className="space-y-3">
      {rating ? <p>{rating.volunteer_score} — {WARMTH_ANCHORS[rating.volunteer_score as 1 | 2 | 3 | 4 | 5]}</p> : <>
        <p className="text-sm">Choose the anchor that fits your own reading of the call.</p>
        {([1, 2, 3, 4, 5] as const).map((score) => <Button key={score} variant="outline" className="mr-2 mb-2" onClick={async () => { try {
          setRating((await api<{ warmth: WarmthView }>(`/logs/${logId}/warmth`, { body: { idempotency_key: crypto.randomUUID(), score } })).warmth);
        } catch (err) { toast.error(errorMessage(err)); } }}>{score}: {WARMTH_ANCHORS[score]}</Button>)}
      </>}
    </CardContent></Card>
    {rating ? <Card><CardHeader><CardTitle>Model crosscheck</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
      {rating.llm_score === null ? <Badge variant="outline">Model unavailable</Badge> : <>
        <p>Caller: {rating.volunteer_score}</p><p>Model: {rating.llm_score}</p><p>Gap: {rating.gap}</p><p>{rating.llm_reason}</p>
        {rating.discussion_prompt ? <Alert><AlertDescription>{rating.discussion_prompt}</AlertDescription></Alert> : null}
      </>}
    </CardContent></Card> : null}
    <Button asChild variant="outline"><Link to="/calls">Back to calls</Link></Button>
  </div>;
}
