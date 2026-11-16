import { useEffect, useRef, useState } from 'react';
import type { Caption, CaptionView } from '../captions';
import { ensureWords, visibleWord, editWordText } from './transcript';

type Status = { available: boolean; provider: string; model: string; csrf: string };
type Suggestion = { id: string; text: string };
export function useImprove() {
  const [status, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [proposal, setProposal] = useState<{
    view: CaptionView;
    before: Suggestion[];
    after: Suggestion[];
    captions: Caption[];
  } | null>(null);
  const controller = useRef<AbortController | null>(null),
    job = useRef(0);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/ai/status', { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!abort.signal.aborted) setStatus(s);
      })
      .catch(() => {});
    return () => {
      abort.abort();
      job.current++;
      controller.current?.abort();
    };
  }, []);
  function cancel() {
    job.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setMessage('AI request cancelled. Your captions are unchanged.');
  }
  async function improve(captions: Caption[], view: CaptionView) {
    if (!status?.available || controller.current) return;
    const id = ++job.current,
      abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setProposal(null);
    setMessage('Sending caption text only to OpenAI…');
    const normalized = captions.map(ensureWords);
    const before = normalized.flatMap((c, i) =>
      (c.words || []).map((w, j) => ({ id: `line_${i}_word_${j}`, text: visibleWord(w, view) })),
    );
    try {
      const r = await fetch('/api/ai/improve', {
        method: 'POST',
        signal: abort.signal,
        headers: { 'Content-Type': 'application/json', 'X-Capto-CSRF': status.csrf },
        body: JSON.stringify({ view, consent: true, words: before }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'AI request failed.');
      if (id !== job.current) return;
      if (
        !Array.isArray(data.words) ||
        data.words.length !== before.length ||
        data.words.some(
          (w: Suggestion, i: number) => w.id !== before[i].id || typeof w.text !== 'string' || !w.text.trim(),
        )
      )
        throw new Error('AI changed the word mapping; no changes applied.');
      setProposal({ view, before, after: data.words, captions: normalized });
      setMessage('Review suggested text changes. Timing has not changed.');
    } catch (error) {
      if (id === job.current) setMessage(error instanceof Error ? error.message : 'AI failed.');
    } finally {
      if (id === job.current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  function accept(): Caption[] | null {
    if (!proposal) return null;
    const map = new Map(proposal.after.map((w) => [w.id, w.text]));
    const next = proposal.captions.map((c, i) =>
      (c.words || []).reduce(
        (next, _, j) => editWordText(next, j, map.get(`line_${i}_word_${j}`)!, proposal.view),
        c,
      ),
    );
    setProposal(null);
    setMessage('AI suggestions applied. Review before sharing.');
    return next;
  }
  const changes =
    proposal?.after
      .filter((w, i) => w.text !== proposal.before[i].text)
      .map((w) => ({ before: proposal.before.find((b) => b.id === w.id)!.text, after: w.text })) || [];
  return {
    status,
    busy,
    message,
    proposal,
    changes,
    improve,
    cancel,
    accept,
    discard: () => {
      setProposal(null);
      setMessage('Suggestions discarded.');
    },
  };
}
