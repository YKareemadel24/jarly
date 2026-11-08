/// Small collection helpers mirroring JavaScript's stable `Array.prototype.sort`.
library;

/// Stable sort: equal-comparing elements keep their relative order, exactly as
/// V8's sort does. Dart's built-in List.sort is not stable.
void stableSort<T>(List<T> list, int Function(T a, T b) compare) {
  final indexed = [for (var i = 0; i < list.length; i++) (list[i], i)];
  indexed.sort((a, b) {
    final result = compare(a.$1, b.$1);
    return result != 0 ? result : a.$2 - b.$2;
  });
  for (var i = 0; i < list.length; i++) {
    list[i] = indexed[i].$1;
  }
}

/// Return a new stably sorted list.
List<T> sortedStable<T>(List<T> list, int Function(T a, T b) compare) {
  final copy = [...list];
  stableSort(copy, compare);
  return copy;
}
