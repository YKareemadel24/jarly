-- Every app table is reachable only through the API server. The server connects
-- with the direct `postgres` role (RLS-bypass), so enabling RLS with no policies
-- closes the PostgREST path that the shipped publishable key would otherwise open.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shared_jars" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shared_jar_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shared_jar_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shared_jar_invites" ENABLE ROW LEVEL SECURITY;
