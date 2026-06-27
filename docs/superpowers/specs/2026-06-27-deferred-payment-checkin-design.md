# Deferred Payment Check-in

**Date:** 2026-06-27  
**Status:** Approved

## Problem

All check-in paths currently write `status: 'paid'` immediately. The `unpaid` payment status exists in the schema but is unreachable, making the Payments page permanently empty.

## Goal

Allow a player to enter the session without paying on the spot. The operator settles the debt later via the Payments page.

## Design

### 1. Backend — `ipc.ts`

Add `'defer'` as a third valid value for the `paymentMethod` parameter of `attendance:checkin`.

When `paymentMethod === 'defer'`:
- Insert the attendance record normally (no balance check).
- Insert a payment record with `status: 'unpaid'`, `paymentMethod: 'cash'`, same `amount` as `sessionFee`.
- No balance deduction.

Add a `sessionId` parameter to `payments:listUnpaid` so callers can scope results to the current session. The Payments page passes `undefined` to keep its existing global view; Checkin passes the active `sessionId`.

### 2. Checkin Page — `Checkin.tsx`

**Context menu:** Add "Check In — Pay Later" as a new item between Edit and Delete. Only shown for players who are not yet checked in.

**`doCheckin`:** Accept `'credit' | 'cash' | 'defer'` and pass through to the IPC handler.

**Load:** After fetching attendance, call `paymentsListUnpaid(sessionId)` to get the set of player IDs with unpaid records for this session. Store as `unpaidIds: Set<string>`.

**Card rendering:** When a checked-in player's ID is in `unpaidIds`, render the card with an orange border (`border-orange-300 bg-orange-50`) and a small `IOU` badge in the top-right corner, instead of the normal gender-tinted style.

### 3. Payments Page — `Payments.tsx`

No changes required. The Unpaid tab and Mark Paid flow already handle settlement correctly. Once `paymentsListUnpaid` accepts an optional `sessionId`, the Payments page continues passing none and sees all sessions.

## Data Flow

```
Right-click player → "Check In — Pay Later"
  → doCheckin(id, 'defer')
  → attendance:checkin(id, sessionId, 'defer')
  → DB: attendance row + payments row (status='unpaid')
  → load() refetches attendance + paymentsListUnpaid(sessionId)
  → card renders with orange IOU style

Payments page → Unpaid tab → "Mark Paid"
  → paymentsMarkPaid(paymentId)
  → DB: payments.status = 'paid'
```

## Out of Scope

- Partial payments
- Deferred top-ups (only session fees)
- Notification/reminder to player
