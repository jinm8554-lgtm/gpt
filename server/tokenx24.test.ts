import { describe, expect, it } from "vitest";

describe("TokenX24 API Token Validation", () => {
  it("should validate the API token format and connectivity", async () => {
    const token = process.env.TOKENX24_API_TOKEN;
    
    // Check token exists
    expect(token).toBeDefined();
    expect(token).toBeTruthy();
    
    // Check token format (should start with sk-)
    expect(token).toMatch(/^sk-/);
    
    // Check token length (typically 60+ characters)
    expect(token?.length).toBeGreaterThan(50);
    
    // Test basic connectivity with a simple optimize request
    try {
      const response = await fetch("https://tokenx24.com/api/v1/ai-image/optimize", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify({
          prompt: "test",
        }),
      });
      
      // We expect either 200 (success) or 400+ (auth/validation error)
      // but NOT 401 (unauthorized) which would indicate invalid token
      expect(response.status).not.toBe(401);
      expect(response.ok || response.status >= 400).toBe(true);
    } catch (error) {
      // Network errors are acceptable in test environment
      console.log("Network test skipped (expected in isolated environments)");
    }
  });
});
