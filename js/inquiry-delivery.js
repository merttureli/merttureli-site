export async function sendInquiry(endpoint, details, {fetchImpl = fetch, timeoutMs = 20000} = {}) {
  if (!/^https:\/\/formspree\.io\/f\/[a-zA-Z0-9]+$/.test(endpoint)) {
    throw new Error('The request form is unavailable. Please use the email link below.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
      body: JSON.stringify(details),
      signal: controller.signal,
      credentials: 'omit'
    });
    if (response.status === 429) {
      throw new Error('The form is busy. Please wait a moment, or use the email link below.');
    }
    if (!response.ok) {
      throw new Error('The form could not accept your request. Your details are still here. Please try again or use the email link below.');
    }
    const result = await response.json().catch(() => null);
    if (!result || (result.ok !== true && result.success !== true) || result.errors?.length) {
      throw new Error('We could not confirm your request was sent. Your details are still here. Please use the email link below if this continues.');
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted || error instanceof TypeError) {
      throw new Error('We could not confirm delivery. Check your connection before trying again. Your details are still here.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
