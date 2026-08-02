## Summary

Describe the focused behavior change and why it belongs in ReadBooster.

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] Chrome build and verifier
- [ ] Firefox build, verifier, and `web-ext lint`
- [ ] Relevant manual browser checks are described accurately

## Safety and maintenance

- [ ] No private conversation or discussion, credential, or personal data is included
- [ ] Browser permissions remain minimal and documented
- [ ] No remote executable code, unsafe HTML insertion, or conversation logging was added
- [ ] Accessibility and keyboard behavior were checked
- [ ] New dependencies and licences were reviewed
- [ ] Documentation and changelog are updated where needed

Platform-adapter changes must also include sanitized fixtures, extraction and duplicate-prevention
tests, streaming/SPA coverage where relevant, and known DOM assumptions.
