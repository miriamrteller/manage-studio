/**
 * Demo build only: re-exports react-router-dom with createBrowserRouter
 * replaced by createHashRouter, so routing works under an artifact URL
 * (no server rewrites, arbitrary base path).
 */
export * from 'react-router-dom';
export { createHashRouter as createBrowserRouter } from 'react-router-dom';
