# Contributing to Refly Bot

Thank you for your interest in contributing to Refly Bot! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions with the community.

## How to Contribute

### Reporting Bugs

If you find a bug, please open an issue with:
- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Your environment (OS, Node.js version, etc.)
- Relevant logs or screenshots

### Suggesting Features

Feature suggestions are welcome! Please open an issue with:
- A clear description of the feature
- Use cases and benefits
- Any implementation ideas you have

### Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature-name`)
3. Make your changes
4. Test your changes thoroughly
5. Commit your changes (`git commit -m 'Add some feature'`)
6. Push to the branch (`git push origin feature/your-feature-name`)
7. Open a Pull Request

### Development Setup

1. Clone your fork:
```bash
git clone https://github.com/yourusername/refly-bot.git
cd refly-bot
```

2. Install dependencies:
```bash
npm install
```

3. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. Run the bot:
```bash
npm run dev
```

### Code Style

- Use ES6+ features
- Follow existing code formatting
- Add comments for complex logic
- Keep functions focused and small
- Use meaningful variable names

### Testing

Before submitting a PR:
- Test your changes with a real Feishu/Lark bot
- Verify all existing functionality still works
- Test edge cases and error scenarios

### Commit Messages

- Use clear, descriptive commit messages
- Start with a verb (Add, Fix, Update, Remove, etc.)
- Keep the first line under 72 characters
- Add details in the body if needed

Example:
```
Add support for image attachments

- Implement image upload handling
- Add image size validation
- Update documentation
```

## Project Structure

```
refly-bot/
├── index.js           # Main bot implementation
├── package.json       # Dependencies and scripts
├── bootstrap.sh       # Unix startup script
├── bootstrap.bat      # Windows startup script
├── .env.example       # Environment variable template
├── .gitignore        # Git ignore rules
├── LICENSE           # Apache 2.0 license
├── README.md         # Project documentation
└── CONTRIBUTING.md   # This file
```

## Adding New Platform Support

If you want to add support for a new messaging platform:

1. Create a new adapter module
2. Implement the platform-specific message handling
3. Integrate with the existing Refly.ai workflow
4. Add documentation for setup and configuration
5. Update the README with the new platform

## Questions?

If you have questions about contributing, feel free to:
- Open an issue for discussion
- Reach out to the maintainers

Thank you for contributing to Refly Bot!
