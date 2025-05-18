# AI Communication Companion

A secure, AI-powered emotional assistant that enhances communication across text, audio, and video conversations.

## Vision

Empowering better communication through real-time emotional intelligence, while maintaining user privacy and control.

## Key Features

- 🎯 **Emotion-Aware Analysis**: Real-time detection of emotional states, stress levels, and conversation dynamics
- 💡 **Live Communication Guidance**: Contextual suggestions for better communication
- 📊 **Smart Summaries**: Automated insights and action items from conversations
- 🔒 **Privacy-First**: Local-first architecture with user-controlled data sharing
- 🎥 **Multi-Modal Support**: Works with text, audio, and video communications

## Tech Stack

- **Frontend**: Next.js with TypeScript
- **Backend**: Node.js with Express
- **AI Processing**: TensorFlow.js for local processing
- **Real-time Communication**: WebRTC
- **State Management**: Redux Toolkit
- **Styling**: Tailwind CSS
- **Testing**: Jest and React Testing Library

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Project Structure

```
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/         # Next.js pages
│   ├── features/      # Feature-specific logic
│   ├── services/      # Core services (AI, WebRTC, etc.)
│   ├── hooks/         # Custom React hooks
│   ├── utils/         # Utility functions
│   └── styles/        # Global styles
├── public/           # Static assets
├── tests/           # Test files
└── docs/            # Documentation
```

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 