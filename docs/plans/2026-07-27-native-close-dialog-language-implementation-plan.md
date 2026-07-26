# Native Close Dialog Language Implementation Plan

**Goal:** Preserve the macOS-native close confirmation dialog and its
system-locale language behavior.

**Architecture:** No application code owns this dialog, so there is no
application-side translation point. The decision is documented in
`2026-07-27-native-close-dialog-language-design.md`; Electron close handling
must remain unchanged.

**Tech Stack:** macOS native UI, Electron 42.

---

### Task 1: Preserve native close behavior

**Files:**
- Verify: `src/main/index.ts`
- Verify: `docs/plans/2026-07-27-native-close-dialog-language-design.md`

**Step 1: Confirm the application does not replace native close behavior**

Verify `src/main/index.ts` has no added window-close interception or
application-owned confirmation dialog.

**Step 2: Confirm the documented decision**

Verify the design document records that the close dialog follows the macOS
locale and remains unchanged.

**Step 3: Commit**

The design decision is already committed. No source, test, or build changes
are required.
