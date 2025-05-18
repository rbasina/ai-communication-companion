import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import TextChat from '../TextChat';

const mockStore = configureStore([]);

describe('TextChat Component', () => {
  let store: any;

  beforeEach(() => {
    store = mockStore({
      communication: {
        emotionalState: {
          stress: 50,
          clarity: 75,
          engagement: 60,
        },
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
  });

  it('displays emotional state metrics', () => {
    render(
      <Provider store={store}>
        <TextChat />
      </Provider>
    );

    expect(screen.getByText('Stress Level:')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Clarity:')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Engagement:')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
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
}); 