# AntiRSI

A modern Electron-based RSI (Repetitive Strain Injury) break reminder application for macOS and Windows. AntiRSI helps prevent RSI by tracking keyboard and mouse activity and prompting you to take regular breaks.

## Features

- **Micro Breaks**: Short 13-second breaks every 4 minutes to prevent repetitive strain
- **Work Breaks**: Longer 8-minute breaks every 50 minutes for proper rest
- **Smart Scheduling**: Natural break continuation when you step away from your computer
- **Process Monitoring**: Automatically pauses timers when certain applications are running
- **Flexible Configuration**: Customize break intervals, durations, and postpone options
- **Modern UI**: Clean, responsive interface built with React and Tailwind CSS
- **Cross-Platform**: Runs on macOS and Windows (Linux support planned)

## How It Works

AntiRSI monitors your keyboard and mouse activity in real-time. When you've been active for the configured intervals, it will:

1. **Micro Breaks**: Show a gentle reminder for a 13-second micro break every 4 minutes
2. **Work Breaks**: Prompt for an 8-minute work break every 50 minutes (with postpone option)
3. **Natural Breaks**: If you step away for more than 30 seconds, it recognizes this as a natural break and adjusts timing accordingly

The application runs quietly in your system tray and can be paused or resumed at any time.

## Installation

### Build from Source

#### Prerequisites

- Node.js 18+
- npm or yarn

#### Build Steps

1. Clone the repository:

```bash
git clone https://github.com/jcampuza/antirsi.git
cd antirsi
```

2. Install dependencies:

```bash
npm install
```

3. Run in development mode:

```bash
npm run dev
```

4. Build for production:

```bash
# Build for macOS
npm run build:mac

# Build for Windows
npm run build:win

# Build for Linux
npm run build:linux
```

## Development

### Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

### Project Structure

- `src/common/` - Core AntiRSI logic and types
- `src/main/` - Electron main process and services
- `src/preload/` - IPC bridge between main and renderer
- `src/renderer/` - React UI components and routing

### Available Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build the application
npm run test         # Run tests
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
npm run typecheck    # Run TypeScript type checking
```

## Configuration

AntiRSI comes with sensible defaults but can be customized:

- **Micro Break**: 13 seconds every 4 minutes
- **Work Break**: 8 minutes every 50 minutes (10-minute postpone option)
- **Natural Break Window**: 30 seconds
- **Tick Interval**: 500ms

Access the configuration panel through the settings button in the main window.

## Acknowledgments

- Original AntiRSI project by [ruuda](https://github.com/ruuda/antiRSI)
- Built with [Electron](https://electronjs.org/), [React](https://reactjs.org/), and [TypeScript](https://www.typescriptlang.org/)
