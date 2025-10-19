// webpack.config.js
import path from "path";
import { fileURLToPath } from "url";
import TerserPlugin from "terser-webpack-plugin";
import webpack from "webpack";

// Emulate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    entry: "./src/index.ts",
    output: {
        filename: "tracker.min.js",
        path: path.resolve(__dirname, "dist"),
        library: {
            name: "analytics",  // window.analytics
            type: "window",
            export: "default"
        },
        clean: true,
        globalObject: "this"
    },
    resolve: {
        extensions: [".ts", ".js"]
    },
    plugins: [
        new webpack.DefinePlugin({
            "process.env.COLLECTION_ENDPOINT": JSON.stringify(process.env.COLLECTION_ENDPOINT)
        })
    ],
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader",
                exclude: /node_modules/
            }
        ]
    },
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin({ extractComments: false })]
    },
    mode: "production"
};