"use client";

import { useEffect, useState } from "react";

interface Pulse {
  id: number;
  project: string;
  brief: string;
  sentiment_score: number;
  image_url: string;
  search_snippets: string[];
  sap_tx: string | null;
  created_at: string;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 7 ? "bg-green-500/20 text-green-400 border-green-500/40" :
    score >= 4 ? "bg-blue-500/20 text-blue-400 border-blue-500/40" :
                 "bg-red-500/20 text-red-400 border-red-500/40";
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${color}`}>
      {score}/10
    </span>
  );
}

function PulseCard({ pulse }: { pulse: Pulse }) {
  const timeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-600 transition-colors">
      {pulse.image_url && (
        <div className="relative h-40 w-full overflow-hidden">
          <img
            src={pulse.image_url}
            alt={pulse.project}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
          <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
            <span className="font-bold text-white text-sm">{pulse.project}</span>
            <ScoreBadge score={pulse.sentiment_score} />
          </div>
        </div>
      )}
      {!pulse.image_url && (
        <div className="px-4 pt-4 flex items-center justify-between">
          <span className="font-bold text-white">{pulse.project}</span>
          <ScoreBadge score={pulse.sentiment_score} />
        </div>
      )}
      <div className="p-4 pt-2 space-y-3">
        <p className="text-gray-300 text-sm leading-relaxed">{pulse.brief}</p>
        {pulse.search_snippets?.length > 0 && (
          <div className="space-y-1">
            {pulse.search_snippets.slice(0, 2).map((s, i) => (
              <p key={i} className="text-gray-500 text-xs truncate">{s}</p>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between pt-1 border-t border-gray-800">
          <span className="text-gray-600 text-xs">{timeAgo(pulse.created_at)}</span>
          {pulse.sap_tx && (
            <a
              href={`https://explorer.solana.com/tx/${pulse.sap_tx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 text-xs hover:text-purple-300 font-mono"
            >
              SAP tx ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchPulses = async (p = page) => {
    try {
      const res = await fetch(`/api/pulses?page=${p}`);
      const json = await res.json();
      setPulses(json.data ?? []);
      setTotal(json.total ?? 0);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch {
      // silently retry on next interval
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchPulses(page);
  }, [page]);

  useEffect(() => {
    if (page !== 1) return;
    const interval = setInterval(() => fetchPulses(1), 30_000);
    return () => clearInterval(interval);
  }, [page]);

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Pulse
              <span className="ml-2 text-xs font-normal text-purple-400 border border-purple-500/40 rounded-full px-2 py-0.5">
                LIVE
              </span>
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Autonomous Solana ecosystem monitor — powered by SAP + Ace Data Cloud
            </p>
          </div>
          <div className="text-right text-xs text-gray-600">
            <div>{total} pulses total</div>
            <div>{lastRefresh ? `Updated ${lastRefresh}` : ""}</div>
          </div>
        </div>

        {/* Pipeline legend */}
        <div className="flex gap-4 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            SerpAPI — news search
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            Chat — sentiment analysis
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-pink-500"></span>
            Embeddings — semantic fingerprint
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            SAP — on-chain settlement
          </span>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-gray-900/40 border border-gray-800 rounded-xl h-64 animate-pulse" />
          ))}
        </div>
      ) : pulses.length === 0 ? (
        <div className="text-center py-24 text-gray-600">
          <p className="text-lg">Waiting for first pulse...</p>
          <p className="text-sm mt-2">Start the agent to begin scanning</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pulses.map((pulse) => (
            <PulseCard key={pulse.id} pulse={pulse} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-1.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:border-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-1.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:border-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </main>
  );
}
