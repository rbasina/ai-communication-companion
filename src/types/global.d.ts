/// <reference types="react" />
/// <reference types="react-dom" />

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare module "*.css" {
  const content: { [className: string]: string };
  export default content;
}

declare module "redux-mock-store" {
  import { Store, Action } from "redux";
  export default function configureStore<T>(middlewares?: any[]): (state?: T) => Store<T>;
} 