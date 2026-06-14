export function getEnrolmentTokenFromSearchParams(searchParams: URLSearchParams): string | null {
  const token = searchParams.get('t');
  return token && token.trim().length > 0 ? token : null;
}

export function enrolmentTokenAuthHeader(token: string | null | undefined): Record<string, string> | undefined {
  if (!token) return undefined;
  return { Authorization: `WaiverToken ${token}` };
}

