# Contributing to Basitune

Thank you for your interest in contributing to Basitune! This document provides guidelines and information for contributors.

## Project Goals

Basitune aims to be a **simple, lightweight desktop wrapper** for YouTube Music. When contributing, please keep these principles in mind:

1. **Simplicity**: Avoid unnecessary features or complexity
2. **Low resource usage**: Keep the app lightweight and fast
3. **Cross-platform**: Ensure changes work on Linux, Windows, and macOS
4. **Clean code**: Write clear, well-commented code
5. **Minimal dependencies**: Only add dependencies when absolutely necessary

## Getting Started

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/Basitune.git
cd Basitune
```

### 2. Set Up Development Environment

```bash
# Run the setup script
./setup.sh  # or ./setup.fish if using fish shell

# Or manually:
npm install
```

### 3. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

## Development Workflow

### Running in Development Mode

```bash
npm run dev
```

This starts the app with hot-reload enabled. Changes to Rust code will trigger a rebuild.

### Testing Your Changes

Before submitting a pull request:

1. **Test on your platform**: Ensure the app runs correctly
2. **Test basic functionality**:
   - App starts and loads YouTube Music
   - Login persists after closing and reopening
   - Window can be resized, minimized, maximized, closed
3. **Check for errors**: Look for console errors or warnings
4. **Test the build**:
   ```bash
   npm run build
   ```

### Code Style

#### Rust Code
- Follow standard Rust conventions
- Use `cargo fmt` to format code
- Use `cargo clippy` to catch common mistakes
- Add comments for non-obvious logic
- Keep functions small and focused

#### JavaScript/HTML
- Use modern ES6+ syntax
- Keep it minimal - remember, we're not building a complex frontend
- Add comments where needed

#### Configuration Files
- Use consistent indentation (2 spaces for JSON)
- Add comments in JSON5 format where helpful

## What to Contribute

### Welcome Contributions

- **Bug fixes**: Fix crashes, errors, or unexpected behavior
- **Documentation**: Improve README, guides, or code comments
- **Platform support**: Help test and fix issues on specific platforms
- **Performance improvements**: Make the app faster or use less memory
- **Icon design**: Create or improve app icons

### Future Features (Discuss First)

These features are planned but need discussion before implementation:

- System tray integration
- Global media key support
- Window state persistence
- Custom keyboard shortcuts
- Configuration/settings system

**Please open an issue** to discuss these features before starting work.

### Not Accepted

- Features that significantly increase complexity
- Custom UI to replace YouTube Music's interface
- Features that violate YouTube's Terms of Service
- Large dependencies that bloat the app
- Platform-specific features that can't work cross-platform

## Pull Request Process

### 1. Ensure Your Code is Ready

- [ ] Code follows project style guidelines
- [ ] Code compiles without warnings (`cargo build`)
- [ ] App runs in development mode (`npm run dev`)
- [ ] App builds for production (`npm run build`)
- [ ] No new compiler or linter warnings
- [ ] Comments added for complex logic

### 2. Update Documentation

- [ ] Update README.md if adding user-facing features
- [ ] Update DEVELOPMENT.md if changing architecture
- [ ] Add comments to code explaining non-obvious behavior

### 3. Commit Your Changes

Write clear, descriptive commit messages:

```bash
# Good commit messages
git commit -m "Fix: Login persistence on Windows"
git commit -m "Add: System tray icon support"
git commit -m "Docs: Update build instructions for Fedora"

# Less helpful commit messages
git commit -m "fix stuff"
git commit -m "update code"
```

### 4. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub with:
- **Clear title**: Summarize the change in one line
- **Description**: Explain what changed and why
- **Testing**: Describe how you tested the changes
- **Screenshots**: If UI changes, include before/after screenshots

### 5. Respond to Feedback

- Be patient - reviews may take time
- Be open to suggestions
- Make requested changes promptly
- Ask questions if feedback is unclear

## Reporting Issues

### Before Opening an Issue

1. **Search existing issues**: Your issue may already be reported
2. **Try latest version**: Update and see if the issue persists
3. **Gather information**: Collect error messages, logs, platform details

### Opening an Issue

Include:
- **Platform**: Linux (distro/version), Windows (version), or macOS (version)
- **Basitune version**: Check package.json
- **Steps to reproduce**: Clear, numbered steps
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Error messages**: Full error text or screenshots
- **Additional context**: Anything else that might be relevant

### Issue Templates

**Bug Report:**
```
**Platform**: Linux Ubuntu 22.04
**Basitune Version**: 0.1.0
**Node Version**: 20.10.0
**Rust Version**: 1.75.0

**Description**
[Clear description of the bug]

**Steps to Reproduce**
1. Launch Basitune
2. Click on ...
3. Observe ...

**Expected Behavior**
[What should happen]

**Actual Behavior**
[What actually happens]

**Error Messages**
[Paste error messages or attach screenshots]
```

**Feature Request:**
```
**Feature Description**
[Clear description of the proposed feature]

**Use Case**
[Why is this feature needed? What problem does it solve?]

**Proposed Implementation**
[If you have ideas on how to implement it]

**Alternatives Considered**
[Other ways to solve the same problem]
```

## Community Guidelines

- Be respectful and inclusive
- Help others learn and grow
- Give constructive feedback
- Assume good intentions
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md) (if present)

## Questions?

- Open a GitHub issue with the "question" label
- Check existing documentation first
- Be specific about what you need help with

## License

By contributing to Basitune, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Basitune! 🎵
