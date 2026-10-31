function getComparisonIdentifiers(comparison) {
  return [comparison?.id, comparison?.signature, comparison?.name].filter(
    Boolean
  );
}

function comparisonMatchesIdSet(comparison, idSet) {
  let identifiers = getComparisonIdentifiers(comparison);
  return identifiers.some(identifier => idSet.has(identifier));
}

function createComparisonLookup(comparisons = []) {
  let lookup = new Map();

  for (let comparison of comparisons) {
    let identifiers = getComparisonIdentifiers(comparison);
    for (let identifier of identifiers) {
      if (!lookup.has(identifier)) {
        lookup.set(identifier, comparison);
      }
    }
  }

  return lookup;
}

function createBatchMutationError(actionVerb, succeededIds, failedIds, errors) {
  let total = succeededIds.length + failedIds.length;
  let message =
    succeededIds.length > 0
      ? `Some baselines failed to ${actionVerb} (${failedIds.length}/${total}).`
      : `Failed to ${actionVerb} ${failedIds.length} baseline${failedIds.length === 1 ? '' : 's'}.`;

  let error = new Error(message);
  error.name = 'BatchMutationError';
  error.action = actionVerb;
  error.succeededIds = succeededIds;
  error.failedIds = failedIds;
  error.errors = errors;
  return error;
}

export function asIdList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (value) {
    return [value];
  }

  return [];
}

export function updateComparisonsUserAction(old, ids, userAction) {
  if (!old?.comparisons || ids.length === 0) {
    return old;
  }

  let idSet = new Set(ids);
  return {
    ...old,
    comparisons: old.comparisons.map(comparison => {
      let matches = comparisonMatchesIdSet(comparison, idSet);
      return matches ? { ...comparison, userAction } : comparison;
    }),
  };
}

export function restoreComparisonsFromPrevious(current, previous, ids) {
  if (!current?.comparisons || !previous?.comparisons || ids.length === 0) {
    return current;
  }

  let idSet = new Set(ids);
  let previousLookup = createComparisonLookup(previous.comparisons);

  return {
    ...current,
    comparisons: current.comparisons.map(comparison => {
      if (!comparisonMatchesIdSet(comparison, idSet)) {
        return comparison;
      }

      let identifiers = getComparisonIdentifiers(comparison);
      for (let identifier of identifiers) {
        let previousComparison = previousLookup.get(identifier);
        if (previousComparison) {
          return previousComparison;
        }
      }

      return comparison;
    }),
  };
}

export async function runBatchMutation(ids, mutationFn, actionVerb) {
  let idList = asIdList(ids);
  if (idList.length === 0) {
    return {
      succeededIds: [],
      failedIds: [],
      errors: [],
    };
  }

  let results = await Promise.allSettled(idList.map(id => mutationFn(id)));
  let succeededIds = [];
  let failedIds = [];
  let errors = [];

  for (let index = 0; index < results.length; index++) {
    let result = results[index];
    let id = idList[index];

    if (result.status === 'fulfilled') {
      succeededIds.push(id);
      continue;
    }

    failedIds.push(id);
    errors.push({
      id,
      error: result.reason,
    });
  }

  if (failedIds.length > 0) {
    throw createBatchMutationError(actionVerb, succeededIds, failedIds, errors);
  }

  return {
    succeededIds,
    failedIds,
    errors,
  };
}
