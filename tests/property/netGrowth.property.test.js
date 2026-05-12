/**
 * Property-based tests for Net Growth Calculation.
 *
 * **Validates: Requirements 36.1**
 *
 * Property 15: Net Growth Calculation
 * For any period with A new activations and C churned customers,
 * the net growth calculation SHALL equal exactly A - C.
 */

const fc = require('fast-check');
const { mergeGrowthData, GROWTH_GROUP_BY } = require('../../src/services/report.service');

/**
 * Generator for a valid period string in YYYY-MM format.
 */
const periodArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
  })
  .map(({ year, month }) => `${year}-${String(month).padStart(2, '0')}`);

/**
 * Generator for a non-negative integer representing customer counts.
 */
const countArb = fc.integer({ min: 0, max: 10000 });

/**
 * Generator for an activation row (no groupBy).
 */
const activationRowArb = fc.record({
  period: periodArb,
  activations: countArb,
});

/**
 * Generator for a churned row (no groupBy).
 */
const churnedRowArb = fc.record({
  period: periodArb,
  churned: countArb,
});

describe('Property 15: Net Growth Calculation', () => {
  it('net growth equals activations minus churned for matching periods', () => {
    fc.assert(
      fc.property(periodArb, countArb, countArb, (period, activations, churned) => {
        const activationsData = [{ period, activations }];
        const churnedData = [{ period, churned }];

        const result = mergeGrowthData(activationsData, churnedData, undefined);

        return (
          result.length === 1 &&
          result[0].netGrowth === activations - churned
        );
      }),
      { numRuns: 1000 }
    );
  });

  it('net growth equals activations when no churned data exists for a period', () => {
    fc.assert(
      fc.property(periodArb, countArb, (period, activations) => {
        const activationsData = [{ period, activations }];
        const churnedData = [];

        const result = mergeGrowthData(activationsData, churnedData, undefined);

        return (
          result.length === 1 &&
          result[0].netGrowth === activations &&
          result[0].churned === 0
        );
      }),
      { numRuns: 1000 }
    );
  });

  it('net growth equals negative churned when no activations exist for a period', () => {
    fc.assert(
      fc.property(periodArb, countArb, (period, churned) => {
        const activationsData = [];
        const churnedData = [{ period, churned }];

        const result = mergeGrowthData(activationsData, churnedData, undefined);

        return (
          result.length === 1 &&
          result[0].netGrowth === -churned &&
          result[0].activations === 0
        );
      }),
      { numRuns: 1000 }
    );
  });

  it('net growth is computed independently per period across multiple periods', () => {
    fc.assert(
      fc.property(
        fc.array(activationRowArb, { minLength: 1, maxLength: 12 }),
        fc.array(churnedRowArb, { minLength: 1, maxLength: 12 }),
        (activationsData, churnedData) => {
          const result = mergeGrowthData(activationsData, churnedData, undefined);

          // Every entry in the result must satisfy netGrowth = activations - churned
          return result.every((entry) => entry.netGrowth === entry.activations - entry.churned);
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('net growth invariant holds with branch grouping', () => {
    const branchActivationArb = fc.record({
      period: periodArb,
      activations: countArb,
      branch_id: fc.integer({ min: 1, max: 50 }),
      group_name: fc.string({ minLength: 1, maxLength: 20 }),
    });

    const branchChurnedArb = fc.record({
      period: periodArb,
      churned: countArb,
      branch_id: fc.integer({ min: 1, max: 50 }),
      group_name: fc.string({ minLength: 1, maxLength: 20 }),
    });

    fc.assert(
      fc.property(
        fc.array(branchActivationArb, { minLength: 1, maxLength: 10 }),
        fc.array(branchChurnedArb, { minLength: 1, maxLength: 10 }),
        (activationsData, churnedData) => {
          const result = mergeGrowthData(activationsData, churnedData, GROWTH_GROUP_BY.BRANCH);

          // The invariant netGrowth = activations - churned must hold for every entry
          return result.every((entry) => entry.netGrowth === entry.activations - entry.churned);
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('empty inputs produce empty result', () => {
    const result = mergeGrowthData([], [], undefined);
    expect(result).toEqual([]);
  });
});
