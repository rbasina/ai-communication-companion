import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import TextChat from '../TextChat';
import { EmotionalState } from '@/types/emotions';

const mockStore = configureStore([]);

const mockEmotionalState: EmotionalState = {
  stress: 50,
  clarity: 75,
  engagement: 60
};

describe('TextChat Component', () => {
  let store: any;

  beforeEach(() => {
    store = mockStore({
      communication: {
        emotionalState: mockEmotionalState,
        history: [],
        mode: 'text'
      },
    });
  });

  it('renders the chat interface', () => {
    render(
      <Provider store={store}>
        <TextChat />
      </Provider>
    );

    expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    expect(screen.getByText('Send Message')).toBeInTheDocument();
  });

  it('handles message submission', async () => {
    render(
      <Provider store={store}>
        <TextChat />
      </Provider>
    );

    const input = screen.getByPlaceholderText('Type your message...');
    const sendButton = screen.getByText('Send Message');

    fireEvent.change(input, { target: { value: 'Hello!' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Hello!')).toBeInTheDocument();
    });

    const actions = store.getActions();
    expect(actions.some((action: any) => action.type.includes('updateEmotionalState'))).toBe(true);
    expect(actions.some((action: any) => action.type.includes('addToHistory'))).toBe(true);
  });

  it('displays emotional state metrics', () => {
    render(
      <Provider store={store}>
        <TextChat />
      </Provider>
    );

    expect(screen.getByText('Stress Level:')).toBeInTheDocument();
    expect(screen.getByText(`${mockEmotionalState.stress}%`)).toBeInTheDocument();
    expect(screen.getByText('Clarity:')).toBeInTheDocument();
    expect(screen.getByText(`${mockEmotionalState.clarity}%`)).toBeInTheDocument();
    expect(screen.getByText('Engagement:')).toBeInTheDocument();
    expect(screen.getByText(`${mockEmotionalState.engagement}%`)).toBeInTheDocument();
  });

  it('disables input while processing', async () => {
    render(
      <Provider store={store}>
        <TextChat />
      </Provider>
    );

    const input = screen.getByPlaceholderText('Type your message...');
    const sendButton = screen.getByText('Send Message');

    fireEvent.change(input, { target: { value: 'Hello!' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(input).toBeDisabled();
      expect(sendButton).toBeDisabled();
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });
  });

  it('handles empty messages', () => {
    render(
      <Provider store={store}>
        <TextChat />
      </Provider>
    );

    const sendButton = screen.getByText('Send Message');
    fireEvent.click(sendButton);

    expect(store.getActions()).toHaveLength(0);
  });

  it('handles long messages', async () => {
    render(
      <Provider store={store}>
        <TextChat />
      </Provider>
    );

    const input = screen.getByPlaceholderText('Type your message...');
    const longMessage = 'a'.repeat(1000);

    fireEvent.change(input, { target: { value: longMessage } });
    expect(input).toHaveValue(longMessage);
  });
}); 