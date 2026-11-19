export function canSelectStudyUnit(unit, capabilities) {
  return unit.state !== 'completed' && (unit.selectable || capabilities.deferred_study && unit.selectable_after_unlock);
}

export function studySelection(available, picks) {
  let lastLockedChapter = -1;
  for (const unit of available) {
    if (unit.selectable_after_unlock && picks.has(unit.id) && Number.isInteger(unit.chapter_order)) {
      lastLockedChapter = Math.max(lastLockedChapter, unit.chapter_order);
    }
  }
  return new Set(available.filter(unit => picks.has(unit.id) || unit.chapter_order < lastLockedChapter).map(unit => unit.id));
}

export function toggleStudyPick(available, picks, id, checked) {
  if (checked) {
    picks.add(id);
  } else {
    picks.delete(id);
    const chapter = available.find(unit => unit.id === id)?.chapter_order;
    if (Number.isInteger(chapter)) {
      for (const unit of available) {
        if (unit.selectable_after_unlock && unit.chapter_order > chapter) picks.delete(unit.id);
      }
    }
  }
  return studySelection(available, picks);
}
