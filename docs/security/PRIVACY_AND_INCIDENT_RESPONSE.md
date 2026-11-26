# ArcTester privacy and security incident response

**Engineering operational draft — not a legal opinion or compliance certification.** Have Indian privacy/security counsel review this document, the product's actual data flows, and current legal applicability before public launch.

## Data inventory and purpose

| Data category | Purpose | Minimum handling |
|---|---|---|
| Account email and password hash | Sign-in, account recovery, notices | Never log passwords or return password hashes; restrict access to account administration |
| Student name and academic profile (college code, branch, registration number) | Institution/branch context, eligibility and student administration | Use only for academic identity and scoped access; do not send identifiers to model datasets |
| Exam/practice answers and results | Scoring, learning progress and analytics | Restrict to the student and authorized staff with a documented academic need |
| Session tokens, MFA secrets, recovery codes, passkey credentials | Authentication and account security | Tokens/codes never logged; TOTP secrets encrypted; recovery codes hashed and single-use |
| Audit events | Accountability, security investigation and authorized student activity timeline | Server-generated, sanitized metadata; access restricted; default retention 365 days, configurable within documented limits |
| Login history and session metadata | Account security, suspicious sign-in review and session management | Failed/throttled sign-ins and new device/network alerts are recorded; login history is pruned by configured retention; expired/revoked sessions older than 90 days are pruned |
| Request/security logs | Reliability, abuse prevention and incident investigation | Avoid query strings, bodies, cookies, bearer tokens, OTPs, raw IP/email in rate-limit bucket records; set an approved retention period |
| Model datasets and metrics | Offline training and evaluation | Synthetic or de-identified data only; verify provenance and avoid direct identifiers/free text |

## Privacy principles and workflows

1. Publish a student-facing privacy notice before collecting real student data. Explain controller/contact identity, purposes, categories, sharing, retention, security, grievance/contact route, and how requests are handled.
2. Collect only fields required for account identity, academic eligibility, learning, and security. Do not use student records for model training by default.
3. Keep production access role-based and least-privilege. Review administrator access periodically and revoke access promptly when roles change.
4. Provide a documented route for access/correction/erasure/grievance requests. Verify the requester, record the request and decision, identify legal/academic retention constraints, complete or explain refusal, and keep only a minimal request audit record.
5. Account deletion/anonymization must remove or de-identify direct identifiers from operational records where legally and technically appropriate. Audit history is designed to survive account deletion with actor references nulled; ensure retained event context does not re-identify the person.
6. Backups must have access controls, encryption at rest where supported, a defined expiry/rotation schedule, and a restore test. Deletion from live systems does not instantly remove immutable backup copies; disclose the backup expiry window.
7. Do not export student data to third-party AI services or model datasets unless there is an approved purpose, contractual/privacy review, and minimization/de-identification.
8. New device/network sign-ins generate an in-app security notification using a masked network hint; failed and throttled sign-ins appear in restricted login history. Notifications are best-effort and are not email/push delivery.

## Incident response

### Severity and triggers
Treat suspected credential compromise, unauthorized student-record access, exposed secrets, malicious model/dataset access, data exfiltration, ransomware, or sustained service compromise as a security incident. Escalate suspected exposure of student personal data immediately.

### Response steps
1. **Triage:** record detection time, reporter, affected systems, evidence locations, and initial scope. Preserve logs; do not copy unnecessary personal data into incident chat.
2. **Contain:** revoke affected sessions/API/MCP keys, rotate exposed secrets, disable vulnerable routes or integrations, restrict database/network access, and isolate compromised workloads.
3. **Investigate:** identify affected accounts/data, attack path, access window, persistence, and whether data was viewed, changed, or exfiltrated. Preserve timestamps and chain of custody.
4. **Recover:** patch and test, restore from verified backups if needed, rotate credentials, validate integrity, and monitor for recurrence.
5. **Notify:** assess applicable legal/contractual notifications promptly with counsel and the responsible organization. CERT-In reporting timelines and required details must be assessed against the currently applicable directions; do not wait for a complete forensic report if a statutory deadline is running.
6. **Close:** document root cause, impact, containment, notifications, remediation owners/dates, and lessons learned. Add regression tests and review the incident playbook.

### Operational checklist
- [ ] Name an incident owner and backup owner before production launch.
- [ ] Maintain an offline contact list for hosting, database, domain, security and legal contacts.
- [ ] Keep secrets out of tickets, logs, screenshots and incident notes.
- [ ] Test session/key revocation and database restore at least periodically.
- [ ] Run a tabletop exercise and update this runbook after a real incident or major architecture change.

## Legal applicability review (India)

As of this checklist update, MeitY has published the Digital Personal Data Protection Rules, 2025 (G.S.R. 846(E), 14 November 2025) and a phased commencement notification for the DPDP Act (G.S.R. 843(E), 13 November 2025). The substantive provisions have staged commencement; map each obligation to its actual effective date rather than assuming all provisions are already operative. Review later corrigenda/notifications before launch.

CERT-In Directions dated 28 April 2022 state that covered entities must report listed cyber incidents within six hours of noticing or being informed, securely maintain ICT logs for a rolling 180 days within Indian jurisdiction, synchronize system clocks to trusted time sources, and designate a point of contact. Confirm applicability, cloud architecture requirements, and incident categories for ArcTester and its hosting providers. The 365-day student audit retention is separate from operational/security-log requirements.

Official references:
- MeitY DPDP Rules 2025 and commencement timeline: https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa
- CERT-In Directions 70B: https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf
- CERT-In directions index and FAQs: https://www.cert-in.org.in/Directions70B.jsp

Have qualified counsel/security personnel determine the actual entity's obligations, applicability, deadlines, log requirements, breach reporting, notices, and retention from current official publications. This checklist does not assert that ArcTester is compliant or that every provision is currently applicable to the project.
