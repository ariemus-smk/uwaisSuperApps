/**
 * Property-based tests for Customer Lifecycle State Machine.
 *
 * **Validates: Requirements 1.3, 1.5**
 *
 * Property 1: Customer Lifecycle State Machine
 * For any customer with a current lifecycle status and any requested target status,
 * the transition validation function SHALL accept the transition if and only if it
 * matches the allowed state graph (Prospek→Instalasi→Aktif→Isolir↔Aktif,
 * Aktif→Terminated, Isolir→Terminated), and reject all other transitions.
 */

const fc = require('fast-check');
const { isValidTransition, getAllowedTransitions } = require('../../src/models/customer.model');
const { CUSTOMER_STATUS, CUSTOMER_STATUS_TRANSITIONS } = require('../../src/utils/constants');

const ALL_STATUSES = Object.values(CUSTOMER_STATUS);

// The allowed transitions map (source of truth from constants)
const VALID_TRANSITIONS = [
  [CUSTOMER_STATUS.PROSPEK, CUSTOMER_STATUS.INSTALASI],
  [CUSTOMER_STATUS.INSTALASI, CUSTOMER_STATUS.AKTIF],
  [CUSTOMER_STATUS.AKTIF, CUSTOMER_STATUS.ISOLIR],
  [CUSTOMER_STATUS.AKTIF, CUSTOMER_STATUS.TERMINATED],
  [CUSTOMER_STATUS.ISOLIR, CUSTOMER_STATUS.AKTIF],
  [CUSTOMER_STATUS.ISOLIR, CUSTOMER_STATUS.TERMINATED],
];

describe('Property 1: Customer Lifecycle State Machine', () => {
  it('any sequence of valid transitions always succeeds (starting from Prospek)', () => {
    // Generate a random sequence of steps through the state machine
    // At each step, pick a random valid transition from the current state
    fc.assert(
      fc.property(
        // Generate a sequence length (number of transitions to attempt)
        fc.integer({ min: 1, max: 20 }),
        fc.infiniteStream(fc.integer({ min: 0, max: 100 })),
        (steps, randomChoices) => {
          let currentStatus = CUSTOMER_STATUS.PROSPEK;
          const choiceIterator = randomChoices[Symbol.iterator]();

          for (let i = 0; i < steps; i++) {
            const allowed = getAllowedTransitions(currentStatus);
            // If no transitions available (Terminated), stop
            if (allowed.length === 0) break;

            // Pick a random valid transition
            const choice = choiceIterator.next().value;
            const nextStatus = allowed[choice % allowed.length];

            // The transition must always be valid
            if (!isValidTransition(currentStatus, nextStatus)) {
              return false;
            }

            currentStatus = nextStatus;
          }
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('invalid transitions are always rejected (any transition not in the allowed map)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_STATUSES),
        fc.constantFrom(...ALL_STATUSES),
        (currentStatus, targetStatus) => {
          // Check if this pair is in the valid transitions list
          const isInValidList = VALID_TRANSITIONS.some(
            ([from, to]) => from === currentStatus && to === targetStatus
          );

          if (isInValidList) {
            // Valid transition must be accepted
            return isValidTransition(currentStatus, targetStatus) === true;
          } else {
            // Invalid transition must be rejected
            return isValidTransition(currentStatus, targetStatus) === false;
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Terminated is a terminal state (no transitions out)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_STATUSES),
        (targetStatus) => {
          // No transition from Terminated to any status should be valid
          return isValidTransition(CUSTOMER_STATUS.TERMINATED, targetStatus) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every state has at least one valid transition except Terminated', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_STATUSES),
        (status) => {
          const transitions = getAllowedTransitions(status);
          if (status === CUSTOMER_STATUS.TERMINATED) {
            // Terminated must have zero transitions
            return transitions.length === 0;
          } else {
            // All other states must have at least one transition
            return transitions.length >= 1;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('the transition function is deterministic (same inputs always give same output)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_STATUSES),
        fc.constantFrom(...ALL_STATUSES),
        (currentStatus, targetStatus) => {
          // Call the function multiple times with the same inputs
          const result1 = isValidTransition(currentStatus, targetStatus);
          const result2 = isValidTransition(currentStatus, targetStatus);
          const result3 = isValidTransition(currentStatus, targetStatus);

          // All results must be identical
          return result1 === result2 && result2 === result3;
        }
      ),
      { numRuns: 200 }
    );
  });
});
