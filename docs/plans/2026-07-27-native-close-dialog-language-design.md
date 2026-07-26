# Native Close Dialog Language Design

## Decision

Keep the macOS-native application-close confirmation dialog unchanged.

## Rationale

Its language follows the operating system locale and cannot be reliably forced
to English by AutoRally. Replacing it with an application-owned dialog would
provide English copy, but would change the native close behavior; that option
was rejected.

## Scope

Do not modify Electron window-close handling. The controllable startup loading
and failure UI remains English. This decision does not affect Chinese CSV
import compatibility.
