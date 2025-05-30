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
│   ├── pages/         # Next.js pages and API routes
│   ├── services/      # Core services (AI, WebRTC, etc.)
│   ├── store/         # Redux Toolkit store and slices
│   ├── styles/        # Global styles
│   └── types/         # TypeScript type definitions
├── public/           # Static assets
├── scripts/          # Utility scripts
├── tests/           # Test files
└── docs/            # Documentation
```

## Project Flow

### Architecture and Data Flow

#### Option 1: Basic Component Flow
```mermaid
graph TD
    A[User Interface] -->|Input/Events| B[Components]
    B -->|State Updates| C[Redux Store]
    C -->|State| B
    B -->|API Calls| D[Services]
    D -->|AI Processing| E[TensorFlow.js]
    E -->|Analysis Results| D
    D -->|Response| B
    B -->|Real-time Data| F[WebRTC]
    F -->|Streams| B
    B -->|Render| A
```
**Description**: This flow shows the core interaction between UI components, state management, and services. User inputs trigger state updates, API calls, and real-time data processing, with results rendered back to the UI.

#### Option 2: Detailed Data Flow
```mermaid
graph LR
    A[User] -->|Text/Audio/Video| B[UI Components]
    B -->|Events| C[Redux Actions]
    C -->|Dispatch| D[Redux Store]
    D -->|State| B
    B -->|API Requests| E[Services Layer]
    E -->|AI Analysis| F[TensorFlow.js]
    F -->|Results| E
    E -->|Data| B
    B -->|Real-time| G[WebRTC Module]
    G -->|Streams| B
    B -->|Feedback| A
```
**Description**: A linear flow highlighting how user data (text, audio, video) moves through the system. It emphasizes the role of Redux for state management and WebRTC for real-time communication.

#### Option 3: Privacy-Focused Flow
```mermaid
graph TB
    A[User] -->|Local Data| B[Components]
    B -->|Process Locally| C[TensorFlow.js]
    C -->|Analysis| B
    B -->|Store Locally| D[Redux Store]
    D -->|Retrieve| B
    B -->|Optional Sync| E[Backend API]
    E -->|User-Controlled| F[Cloud/DB]
    B -->|Render| A
```
**Description**: Focuses on local data processing and storage, with optional cloud sync controlled by the user. Ideal for privacy-sensitive applications.

#### Option 4: Component-Level Flow
```mermaid
graph LR
    subgraph UI Components
        TextChat
        AudioChat
        VideoChat
        EmotionAnalysisVisualizer
    end

    subgraph Services
        TextAnalysisService
        AudioAnalysisService
        VideoAnalysisService
        WebRTCService
    end

    subgraph Data & Processing
        ConversationSlice[conversationSlice]
        TensorFlowJS[TensorFlow.js]
        AudioProcessor
        VideoProcessor
    end

    TextChat -->|Text Input| ConversationSlice
    TextChat -->|Send for Analysis| TextAnalysisService
    AudioChat -->|Audio Stream| WebRTCService
    AudioChat -->|Send for Analysis| AudioAnalysisService
    AudioChat --> AudioProcessor
    VideoChat -->|Video Stream| WebRTCService
    VideoChat -->|Send for Analysis| VideoAnalysisService
    VideoChat --> VideoProcessor

    ConversationSlice -->|State| EmotionAnalysisVisualizer
    TextAnalysisService -->|Results| ConversationSlice
    AudioAnalysisService -->|Results| ConversationSlice
    VideoAnalysisService -->|Results| ConversationSlice

    TextAnalysisService --> TensorFlowJS
    AudioAnalysisService --> TensorFlowJS
    VideoAnalysisService --> TensorFlowJS

    AudioProcessor --> TensorFlowJS
    VideoProcessor --> TensorFlowJS
    WebRTCService --> AudioProcessor
    WebRTCService --> VideoProcessor

    ConversationSlice --> TextChat
    ConversationSlice --> AudioChat
    ConversationSlice --> VideoChat

```
**Description**: This diagram illustrates the direct interactions and data flow between specific components, services, and data layers within the application, aligning with the detailed interaction flows.

### Detailed Interaction Flow

#### Text Interface
1. **User Input**: Text is entered into the UI via `src/components/TextChat.tsx`.
2. **Component Handling**: The `src/components/TextChat.tsx` dispatches a Redux action (`storeText`) to temporarily store the text in `src/store/slices/conversationSlice.ts`.
3. **AI Processing**: The `src/services/TextAnalysisService.ts` sends the text to `TensorFlow.js` (`emotionDetectionModel`).
4. **Feedback**: Results are stored in `conversationSlice` and displayed via `src/components/EmotionAnalysisVisualizer.tsx`.

#### Audio Interface
1. **User Input**: Audio is captured via `src/components/AudioChat.tsx` (using browser's `MediaRecorder` API).
2. **Component Handling**: The `src/scripts/audioProcessor.ts` processes the stream via `src/services/WebRTCService.ts` (`audioStreamModule`) or stores it locally (`localAudioStorage`).
3. **AI Processing**: The `src/services/AudioAnalysisService.ts` sends data to `TensorFlow.js` (`toneAnalysisModel`).
4. **Feedback**: Real-time suggestions are rendered by `src/components/EmotionAnalysisVisualizer.tsx`.

#### Video Interface
1. **User Input**: Video is captured via `src/components/VideoChat.tsx` (using browser's `getUserMedia` API).
2. **Component Handling**: Frames are processed by `src/scripts/videoProcessor.ts` via `WebRTCService.ts` (`videoStreamModule`) or analyzed locally (`localFrameAnalysis`).
3. **AI Processing**: The `src/services/VideoAnalysisService.ts` uses `TensorFlow.js` (`facialExpressionModel`).
4. **Feedback**: Insights are displayed by `src/components/EmotionAnalysisVisualizer.tsx`.

### Contribution Workflow

We welcome contributions! Please follow these steps:
1. Fork and clone the repository.
2. Install dependencies (`npm install`).
3. Set up environment variables (`cp .env.example .env.local`).
4. Make your changes and ensure they adhere to the project's coding standards.
5. Test your changes thoroughly.
6. Submit a pull request with a clear description of your changes.
Please refer to the [CONTRIBUTING.md](CONTRIBUTING.md) file for more detailed guidelines.

### User Interaction Flow

Users interact with the application through its frontend interface.
1.  The application integrates with communication platforms to access text, audio, or video streams (details of integration mechanisms are handled within the services layer).
2.  Real-time data is fed to the local AI processing module (TensorFlow.js).
3.  Emotion analysis and communication dynamics are detected locally.
4.  The application provides real-time feedback and suggestions to the user based on the analysis.
5.  Optionally, conversations can be summarized, and action items are generated, stored locally, and accessible via the UI.
6.  User settings control privacy preferences and data sharing options.
