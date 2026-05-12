# Security Specification for ClinicoStock

## 1. Data Invariants
- **Medicine**: `stock` must be >= 0. Document ID must match `drugId`.
- **Order**: Can only be created by an authenticated `doctor`. `status` must start as `Pendiente`.
- **Order Delivery**: Only a user with `role == 'pharmacy'` can change status from `Pendiente` to `Entregado`.
- **Stock Sync**: When an order is marked `Entregado`, the corresponding medicine's `stock` must be decremented by 1 in the same transaction (batch).
- **Users**: Users cannot change their own `role`.

## 2. The "Dirty Dozen" Payloads (Denial Tests)
1. Create Medicine with negative stock.
2. Create Order as an unauthenticated user.
3. Create Order as a pharmacy user (only doctors should create).
4. Create Order for a medicine with stock 0.
5. Update Order status to 'Entregado' as a doctor.
6. Update Order status to 'Entregado' without decrementing inventory stock.
7. Update Medicine stock directly as a doctor.
8. Delete an Order (not allowed).
9. Change another user's role.
10. Create an Order with status 'Entregado' initially.
11. Update Order status from 'Entregado' back to 'Pendiente'.
12. Create Medicine with a 2MB name string.

## 3. Test Runner Concept
The `firestore.rules` will be validated against these invariants.
