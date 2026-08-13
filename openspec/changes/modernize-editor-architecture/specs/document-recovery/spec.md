## Purpose

Persists the working document across browser sessions so that an accidental close or refresh does not lose work, and offers the user a clear choice to restore, dismiss, or discard the recovered copy on next load.

## ADDED Requirements

### Requirement: Autosave the working document to local storage

The editor SHALL automatically persist the current document model to browser local storage as the user edits. Autosave SHALL occur on a debounced cadence after changes, not on every keystroke.

#### Scenario: Edits are persisted without explicit save

- **WHEN** the user edits the document and pauses
- **THEN** the current document HTML is present in local storage without the user invoking any save action

#### Scenario: Autosave is debounced

- **WHEN** the user types continuously without pausing
- **THEN** autosave is deferred until a short pause occurs, rather than running on every keystroke

### Requirement: Restore prompt on next load

When the editor loads and a non-empty autosaved document exists that is newer than any explicitly-stored state, the editor SHALL prompt the user to continue where they left off, dismiss the prompt without restoring, or discard the recovered copy.

#### Scenario: Restore returns the recovered document

- **WHEN** the editor loads with a recovered copy present and the user chooses to restore
- **THEN** the document model is populated with the recovered HTML

#### Scenario: Dismiss keeps the copy for a future session

- **WHEN** the user chooses to dismiss the prompt without restoring
- **THEN** the editor starts empty and the recovered copy remains in local storage for the next load

#### Scenario: Discard deletes the recovered copy

- **WHEN** the user chooses to discard the recovered copy
- **THEN** the recovered copy is removed from local storage and the editor starts empty

### Requirement: Recovery copy is local and private

The recovered document SHALL be stored only in the user's browser local storage and SHALL NOT be transmitted anywhere. The restore prompt SHALL state this.

#### Scenario: Prompt communicates local-only storage

- **WHEN** the restore prompt is shown
- **THEN** the prompt text indicates that the copy is stored only in this browser and is not sent anywhere
