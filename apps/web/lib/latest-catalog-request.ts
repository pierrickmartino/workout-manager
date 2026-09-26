interface CatalogRequestTicket {
  run<Result>(
    load: () => Promise<Result>,
    commit: (result: Result) => void,
  ): Promise<void>;
  cancel(): void;
}

interface LatestCatalogRequest {
  begin(filterKey: string): CatalogRequestTicket;
  invalidate(): void;
}

// Coordinates debounced Catalog reads. A ticket is made current before its delayed request
// starts, and callers can invalidate it synchronously as filters change, so an older response
// cannot replace the results or error for the new filters. The sequence also distinguishes
// repeated requests for the same filter key (for example, after reconnecting).
export function createLatestCatalogRequest(): LatestCatalogRequest {
  let currentSequence = 0;
  let currentFilterKey = "";

  return {
    begin(filterKey) {
      const sequence = ++currentSequence;
      currentFilterKey = filterKey;
      const isCurrent = () =>
        sequence === currentSequence && filterKey === currentFilterKey;

      return {
        async run(load, commit) {
          if (!isCurrent()) return;
          const result = await load();
          if (isCurrent()) commit(result);
        },
        cancel() {
          if (isCurrent()) currentSequence += 1;
        },
      };
    },
    invalidate() {
      currentSequence += 1;
    },
  };
}
