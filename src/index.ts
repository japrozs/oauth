import "reflect-metadata";
import "dotenv-safe/config";
import { __prod__, COOKIE_NAME, COOKIE_SECRET } from "./constants";
import express from "express";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { UserResolver } from "./resolvers/user";
import Redis from "ioredis";
import session from "express-session";
import connectRedis from "connect-redis";
import cors from "cors";
import { createConnection } from "typeorm";
import { User } from "./entities/User";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github";
import cookieParser from "cookie-parser";
import cookieEncrypter from "cookie-encrypter";

const main = async () => {
    const conn = await createConnection({
        type: "postgres",
        database: "oauth-backend",
        username: "postgres",
        password: "postgres",
        logging: true,
        synchronize: true,
        entities: [User],
    });
    await conn.runMigrations();
    const app = express();

    const RedisStore = connectRedis(session);
    const redis = new Redis();
    app.use(
        cors({
            origin: "http://localhost:3000",
            credentials: true,
        })
    );
    app.use(
        session({
            name: COOKIE_NAME,
            store: new RedisStore({
                client: redis,
                disableTouch: true,
            }),
            cookie: {
                maxAge: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
                httpOnly: true,
                sameSite: "lax", // csrf
                secure: __prod__, // cookie only works in https
            },
            saveUninitialized: false,
            secret: COOKIE_SECRET,
            resave: false,
        })
    );
    app.use(cookieParser(COOKIE_SECRET));
    app.use(cookieEncrypter(COOKIE_SECRET));
    app.use(passport.initialize());
    app.use(passport.session());

    const apolloServer = new ApolloServer({
        schema: await buildSchema({
            resolvers: [UserResolver],
            validate: false,
        }),
        context: ({ req, res }) => ({ req, res, redis }),
    });

    apolloServer.applyMiddleware({
        app,
        cors: false,
    });

    passport.serializeUser((user: any, done) => {
        done(null, user.githubId);
    });

    passport.use(
        new GitHubStrategy(
            {
                clientID: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
                callbackURL: "http://localhost:4000/auth/github/callback",
            },
            async (_, __, profile, cb) => {
                let user = await User.findOne({
                    where: { githubId: profile.id },
                });

                if (user === undefined) {
                    await User.create({
                        name: profile.displayName,
                        imgUrl: profile.photos
                            ? profile.photos[0].value
                            : "https://avatars.githubusercontent.com/u/57936?v=4",
                        email: profile?.emails && profile?.emails[0]?.value,
                        githubId: profile.id,
                    }).save();

                    const u = await User.findOne({
                        where: { githubId: profile.id },
                    });
                    cb(null, u);
                } else {
                    // user is in the database, update the info
                    user.name = profile.displayName;
                    user.imgUrl = profile.photos
                        ? profile.photos[0].value
                        : "https://avatars.githubusercontent.com/u/57936?v=4";
                    user.email = profile?.emails && profile?.emails[0]?.value;

                    // you can also use User.update()
                    await user.save();

                    const u = await User.findOne({
                        where: { githubId: profile.id },
                    });
                    console.log("userDb", u);
                    cb(null, u);
                }
            }
        )
    );

    app.get(
        "/auth/github",
        passport.authenticate("github", {
            session: false,
        })
    );

    app.get(
        "/auth/github/callback",
        passport.authenticate("github", {
            session: false,
        }),
        async (req, res) => {
            res.cookie(COOKIE_NAME, (req.user as User).id, {
                maxAge: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
                httpOnly: true,
                sameSite: "lax", // csrf
                secure: __prod__, // cookie only works in https
            });
            res.json({ user: req.user });
        }
    );

    app.get("/", async (req, res) => {
        const { qid } = req.cookies;
        console.log(qid);
        const user = await User.findOne(qid);

        res.json({ user });
    });

    app.listen(4000, () => {
        console.log(`🚀 Server started on http://localhost:4000`);
    });
};

main().catch((err) => {
    console.error(err);
});
