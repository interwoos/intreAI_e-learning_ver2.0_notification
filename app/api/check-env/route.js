export const GET = () => {
    const env = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    console.log("環境変数:", env);
    return Response.json({ env });
  };