import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import TextChat from '../components/TextChat';
import { RootState } from '../store/store';

const mockStore = configureStore<RootState>([]);

describe('TextChat Component', () => {
  let store: any;

  beforeEach(() => {
    store = mockStore({
      communication: {
        messages: [],
        emotionalStates: {
          text: {
            stress: 50,
            clarity: 50,
            engagement: 50
          },
          audio: {
            stress: 50,
            clarity: 50,
            engagement: 50
          }
        },
        isProcessing: false,
        error: null
      }
    });

    // Mock dispatch
    store.dispatch = jest.fn();
  });

  it('renders the chat interface', () => {
    render(
      <Provider store={store}>
        <TextChat />
      </Provider>
    );

    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
  });

  it('handles message submission', async () => {
    render(
      <Provider store={store}>
        <TextChat />
      </Provider>
    );

    const input = screen.getByPlaceholderText(/type a message/i);
    const message = 'Hello, world!';

    fireEvent.change(input, { target: { value: message } });
    fireEvent.submit(screen.getByRole('form'));

    expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: expect.stringContaining('sendMessage'),
      payload: expect.objectContaining({ content: message })
    }));
  });

  it('displays emotional state metrics', () => {
    render(
      <Provider store={store}>
        <TextChat />
      </Provider>
    );

    expect(screen.getByText(/stress/i)).toBeInTheDocument();
    expect(screen.getByText(/clarity/i)).toBeInTheDocument();
    expect(screen.getByText(/engagement/i)).toBeInTheDocument();
  });

  it('disables input while processing', async () => {
    store = mockStore({
      communication: {
        messages: [],
        emotionalStates: {
          text: {
            stress: 50,
            clarity: 50,
            engagement: 50
          },
          audio: {
            stress: 50,
            clarity: 50,
            engagement: 50
          }
        },
        isProcessing: true,
        error: null
      }
    });

    render(
      <Provider store={store}>
        <TextChat />
      </Provider>
    );

    const input = screen.getByPlaceholderText(/type a message/i);
    expect(input).toBeDisabled();
  });
}); 