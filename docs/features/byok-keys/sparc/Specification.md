# Specification: BYOK Key Management

## User Stories & Acceptance Criteria

---

### US-BYOK-01: Enter and Store BYOK API Key

**As a** user on the Global AI provider strategy,
**I want to** enter my own Gemini/OpenAI/Anthropic API key,
**So that** the system uses my API credits for video processing.

**Acceptance Criteria:**

```gherkin
Feature: BYOK Key Entry

  Scenario: Enter valid Gemini API key
    Given my AI provider preference is "global"
    And I am on Settings > API Keys page
    When I enter a valid Gemini API key in the masked input field
    And I click "Verify" (Проверить)
    Then the system tests the key via a proxy API call within 5 seconds
    And I see "Ключ Gemini подключен" with a green checkmark
    And the key is encrypted with AES-GCM 256-bit and stored in IndexedDB
    And the plaintext key is never sent to the server for storage

  Scenario: Enter valid OpenAI API key
    Given my AI provider preference is "global"
    When I enter a valid OpenAI API key and click "Verify"
    Then the system tests the key by calling OpenAI's models endpoint
    And I see "Ключ OpenAI подключен" with a green checkmark

  Scenario: Enter valid Anthropic API key
    Given my AI provider preference is "global"
    When I enter a valid Anthropic API key and click "Verify"
    Then the system tests the key by calling Anthropic's API
    And I see "Ключ Anthropic подключен" with a green checkmark

  Scenario: Enter invalid API key
    Given I am on Settings > API Keys page
    When I enter an invalid API key and click "Verify"
    Then I see "Ключ невалидный. Проверьте и попробуйте снова"
    And the key is NOT stored in IndexedDB

  Scenario: Vault requires password to store key
    Given I have not entered my vault password in this session
    When I try to add an API key
    Then I am prompted to enter my vault password first
    And after entering the correct password, the vault unlocks for 30 minutes
```

---

### US-BYOK-02: Remove BYOK API Key

**As a** user with stored BYOK keys,
**I want to** remove a stored API key,
**So that** the system falls back to platform-provided keys.

```gherkin
Feature: BYOK Key Removal

  Scenario: Remove stored key
    Given I have a stored Gemini API key
    When I click "Delete" (Удалить ключ) next to Gemini
    And I confirm the deletion
    Then the encrypted key is removed from IndexedDB
    And future processing uses the platform's shared Gemini key
    And I see "Ключ Gemini удален"

  Scenario: Remove one key, keep others
    Given I have stored keys for Gemini and OpenAI
    When I remove the Gemini key
    Then only the Gemini key is removed
    And the OpenAI key remains stored and functional
```

---

### US-BYOK-03: Auto-Lock Vault

**As a** security-conscious user,
**I want** the vault to auto-lock after 30 minutes of inactivity,
**So that** my API keys are protected if I leave my computer.

```gherkin
Feature: Vault Auto-Lock

  Scenario: Auto-lock after inactivity
    Given I have unlocked the vault with my password
    When 30 minutes pass with no user interaction (mouse, keyboard, touch)
    Then the master key is cleared from memory
    And I must re-enter my password to use or view stored keys
    And a toast notification says "Хранилище заблокировано"

  Scenario: Activity resets timer
    Given I unlocked the vault 25 minutes ago
    When I interact with any page element
    Then the 30-minute timer resets

  Scenario: Manual lock
    Given the vault is unlocked
    When I click the "Lock" (Заблокировать) button
    Then the vault locks immediately
    And the master key is cleared from memory
```

---

### US-BYOK-04: BYOK Key Used for Video Processing

**As a** user with stored BYOK keys and Global strategy,
**I want** my API keys used automatically when I process a video,
**So that** the processing uses my API credits.

```gherkin
Feature: BYOK Processing

  Scenario: Process video with BYOK Gemini key
    Given I have a stored Gemini API key and the vault is unlocked
    And my AI provider preference is "global"
    When I upload a video for processing
    Then the system uses my Gemini key for LLM calls (moment selection, scoring, titles)
    And my OpenAI key (if stored) for Whisper STT
    And the keys are sent encrypted to the server, used once, then discarded

  Scenario: Vault locked during upload
    Given I have stored BYOK keys but the vault is locked
    When I upload a video for processing
    Then I am prompted to unlock the vault with my password
    And processing starts after unlocking

  Scenario: BYOK key fails, fallback to server key
    Given my BYOK Gemini key has been revoked (invalid)
    When the system tries to use it for an LLM call
    Then the call fails with 401/403
    And the system retries with the platform's shared key
    And I am notified: "Ваш ключ Gemini отклонен. Использован резервный ключ"

  Scenario: No BYOK key for specific provider
    Given I have a BYOK key for Gemini but NOT for Anthropic
    And the LLM Router selects Claude Haiku (Tier 2)
    Then the system uses the platform's Anthropic key
    And my Gemini key is used for Gemini-based tiers
```

---

### US-BYOK-05: Settings UI for BYOK Keys

**As a** user,
**I want to** see a clear interface for managing my API keys,
**So that** I can easily add, test, and remove keys.

```gherkin
Feature: BYOK Settings UI

  Scenario: View API keys page
    Given I am on Settings page
    When I navigate to the "API Keys" (API Ключи) section
    Then I see three provider cards: Gemini, OpenAI, Anthropic
    And each card shows connection status (connected/not connected)
    And each card has a "Where to get key?" (Где взять ключ?) link
    And there is a vault lock/unlock indicator

  Scenario: Provider card with stored key
    Given I have a stored Gemini API key
    Then the Gemini card shows:
      - Status: "Подключен" (green)
      - Key preview: "AIza...k7Gw" (first 4 + last 4 chars)
      - "Delete" button
      - "Update" button
      - Date added

  Scenario: Provider card without stored key
    Given I have no stored OpenAI key
    Then the OpenAI card shows:
      - Status: "Не подключен" (gray)
      - Masked input field for API key
      - "Verify" (Проверить) button (disabled until key entered)
      - "Where to get key?" link to https://platform.openai.com/api-keys

  Scenario: BYOK visible only for Global strategy
    Given my AI provider preference is "ru" (Cloud.ru)
    When I view the Settings page
    Then I do NOT see the API Keys section
    And a note says: "API ключи доступны при использовании Global стратегии"
```

---

## Non-Functional Requirements

### NFR-BYOK-01: Security

| Requirement | Implementation |
|-------------|---------------|
| Encryption algorithm | AES-GCM 256-bit (Web Crypto API) |
| Key derivation | PBKDF2, SHA-256, 100,000+ iterations, 16-byte random salt |
| IV uniqueness | 12-byte random IV per encryption operation (crypto.getRandomValues) |
| Master key storage | In-memory only (JavaScript closure), never persisted |
| Auto-lock | 30 min inactivity timer, clears master key from memory |
| Transport security | HTTPS only (TLS 1.3), key in custom header `X-BYOK-Key` |
| Server-side handling | Decrypt from header, use for API call, discard. Never log, never persist in DB |
| Redis cache | AES-256-GCM encrypted with server key, 5-min TTL, deleted after use |
| No localStorage | Keys MUST NOT be stored in localStorage or sessionStorage |
| No logging | BYOK keys MUST NOT appear in logs, error reports, or analytics |

### NFR-BYOK-02: Performance

| Metric | Target |
|--------|--------|
| Vault unlock time | <500ms (PBKDF2 derivation) |
| Key encryption time | <50ms |
| Key decryption time | <50ms |
| Test API call latency | <5 seconds (p95) |
| BYOK overhead per request | <100ms (header extraction + Redis lookup) |

### NFR-BYOK-03: Reliability

| Requirement | Target |
|-------------|--------|
| Fallback to server key | Always, when BYOK key fails |
| Browser storage availability | Graceful degradation if IndexedDB unavailable |
| Concurrent vault access | Single tab at a time (BroadcastChannel lock) |

## Feature Matrix

| Feature | MVP | v2 |
|---------|-----|-----|
| Client-side AES-GCM encryption | Yes | Yes |
| IndexedDB storage | Yes | Yes |
| PBKDF2 key derivation | Yes | Yes |
| 30-min auto-lock | Yes | Yes |
| Test key validation | Yes | Yes |
| Settings UI (3 providers) | Yes | Yes |
| Redis ephemeral cache for workers | Yes | Yes |
| Encrypted key export/import | No | Yes |
| Key rotation reminders | No | Yes |
| Per-key usage tracking | No | Yes |
| BroadcastChannel multi-tab sync | No | Yes |
