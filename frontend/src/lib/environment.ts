// Environment detection utilities

export const isDevelopment = (): boolean => {
  return import.meta.env.DEV || 
         window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         window.location.port !== ''
}

export const isProduction = (): boolean => {
  return !isDevelopment()
}

export const getEnvironment = (): 'development' | 'production' => {
  return isDevelopment() ? 'development' : 'production'
}
