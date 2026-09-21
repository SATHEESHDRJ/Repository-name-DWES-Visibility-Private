/** Pure request-generation primitive shared by the React hook and race tests. */
export class LatestRequestGate {
  private generation = 0;

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  invalidate(): void {
    this.generation += 1;
  }

  isLatest(generation: number): boolean {
    return generation === this.generation;
  }
}
